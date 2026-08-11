import Link from "next/link";
import Image from "next/image";
import { ActionResultBanner } from "@/app/shop/_components/ActionResultBanner";
import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "@/components/shop/shopLayout";
import type { Json } from "@/lib/supabase/database.types";
import { createLocalizedPageMetadata } from "@/i18n/metadata";
import {
  getStorefrontPublicationsReadModel,
  type StorefrontDeliveryZone,
  type StorefrontFulfillmentSlot,
  type StorefrontPickupPoint,
  type StorefrontPublicationRow,
  type StorefrontPromotionRow,
  type StorefrontPublicationsReadModel,
} from "@/server/shop-admin/storefront-read-model";
import {
  bulkPauseStorefrontAction,
  bulkPublishStorefrontAction,
  saveStorefrontDeliveryZoneAction,
  saveStorefrontFulfillmentSettingsAction,
  saveStorefrontFulfillmentSlotAction,
  saveStorefrontPickupPointAction,
  saveStorefrontPaymentSettingsAction,
  saveStorefrontPromotionAction,
  saveStorefrontPublicationAction,
} from "./actions";
import { StorefrontImagesControl } from "./StorefrontImagesControl";

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
  ["settings", "Ritiro e consegna"],
  ["payments", "Pagamenti"],
  ["audit", "Audit"],
] as const;

type StorefrontArea = (typeof areas)[number][0];

const fieldClassName =
  "h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-950 shadow-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15";
const buttonClassName =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-zinc-300";
const secondaryButtonClassName =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:text-zinc-400";

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
    if (
      value &&
      key !== "action" &&
      key !== "result" &&
      key !== "target_id"
    ) next.set(key, value);
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
  if (status === "published" || status === "active") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "paused" || status === "ended") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-zinc-200 bg-zinc-100 text-zinc-700";
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

function Filters({ params }: { params: Record<string, string | string[] | undefined> }) {
  const shopId = param(params, "shop_id");
  const activeFilters = ["q", "status", "availability", "discounted", "missing_image", "sort"]
    .filter((key) => Boolean(param(params, key)) && !(key === "sort" && param(params, key) === "updated_desc"))
    .length;
  return (
    <form aria-label="Filtri catalogo Storefront" className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm lg:sticky lg:top-16 lg:z-10 lg:grid-cols-7" method="get">
      {shopId ? <input name="shop_id" type="hidden" value={shopId} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-2 lg:col-span-7">
        <div>
          <h2 className="text-sm font-semibold text-zinc-950">Filtri catalogo</h2>
          <p className="text-xs text-zinc-500">La selezione resta nell’URL durante editor, anteprima e paginazione.</p>
        </div>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700" role="status">{activeFilters} attivi</span>
      </div>
      <label className="grid gap-1 text-xs font-medium text-zinc-700 lg:col-span-2">
        Cerca
        <input className={fieldClassName} defaultValue={param(params, "q")} maxLength={160} name="q" placeholder="Nome, barcode, marca o categoria" type="search" />
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

function publicationAvailabilityLabel(value: string | null) {
  return {
    available: "Disponibile",
    delivery_only: "Solo consegna",
    low_stock: "Scorte basse",
    pickup_only: "Solo ritiro",
    reservation_only: "Solo prenotazione",
    unavailable: "Non disponibile",
  }[value ?? "unavailable"] ?? "Disponibilità da verificare";
}

function PublicationCardPreview({ row }: { row: StorefrontPublicationRow }) {
  const currentPrice = row.retailPriceClp ?? row.operationalPrice;
  const fulfillment = [
    row.pickupEnabled ? "Ritiro" : null,
    row.deliveryEnabled ? "Consegna" : null,
    row.reservationEnabled ? "Prenotazione" : null,
  ].filter(Boolean);

  return (
    <aside
      aria-label={`Anteprima cliente ${row.publicName ?? row.operationalName ?? row.barcode}`}
      className="self-start rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm xl:sticky xl:top-48"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Anteprima cliente</p>
          <p className="text-xs text-zinc-500">Dati pubblici correnti</p>
        </div>
        <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusTone(row.publicationStatus)}`}>
          {row.publicationStatus}
        </span>
      </div>
      <div className="mt-4 rounded-xl bg-zinc-50 p-4">
        <p className="text-xs font-semibold text-emerald-800">{row.publicCategoryName ?? "Categoria da assegnare"}</p>
        <h3 className="mt-1 text-lg font-semibold leading-snug text-zinc-950">
          {row.publicName ?? row.operationalName ?? "Prodotto senza nome"}
        </h3>
        <p className="mt-3 text-2xl font-semibold text-zinc-950">{clp(currentPrice)}</p>
        {row.compareAtPriceClp !== null && currentPrice !== null && row.compareAtPriceClp > currentPrice ? (
          <p className="mt-1 text-sm text-zinc-500 line-through">{clp(row.compareAtPriceClp)}</p>
        ) : null}
        <p className="mt-4 text-sm font-medium text-zinc-800">{publicationAvailabilityLabel(row.availabilityMode)}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {fulfillment.length > 0 ? fulfillment.map((option) => (
            <span className="rounded-full border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700" key={option}>{option}</span>
          )) : <span className="text-xs text-amber-800">Nessuna modalità commerciale abilitata</span>}
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-zinc-500">
        {row.publishedImageVersionId ? "Immagine pubblica pronta." : "Nessuna immagine pubblica selezionata."}
      </p>
    </aside>
  );
}

function PublicationEditor({ model, row }: { model: StorefrontPublicationsReadModel; row: StorefrontPublicationRow }) {
  const images = model.images.filter((image) => image.sourceProductId === row.sourceProductId);
  const defaultPrice = row.retailPriceClp ?? row.operationalPrice ?? 0;
  return (
    <details className="border-t border-zinc-200 bg-zinc-50 px-4 py-3">
      <summary className="cursor-pointer rounded-md text-sm font-semibold text-emerald-800 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2">Modifica pubblicazione</summary>
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(17rem,0.8fr)]">
      <form action={saveStorefrontPublicationAction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
        <div
          aria-label={`Disponibilità commerciale: ${publicationAvailabilityLabel(row.availabilityMode)}`}
          className="grid gap-1 rounded-md border border-zinc-200 bg-white p-3"
          role="status"
        >
          <span className="text-xs font-medium text-zinc-700">Disponibilità commerciale</span>
          <span className="text-sm font-semibold text-zinc-950">
            {publicationAvailabilityLabel(row.availabilityMode)}
          </span>
          <span className="text-xs leading-5 text-zinc-500">
            Derivata server-side dallo stato operativo e dalle modalità abilitate. La quantità resta privata.
          </span>
        </div>
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
      <PublicationCardPreview row={row} />
      </div>
    </details>
  );
}

function Catalog({ model, params }: { model: StorefrontPublicationsReadModel; params: Record<string, string | string[] | undefined> }) {
  return (
    <div className="grid gap-5">
      <Filters params={params} />
      <form aria-label="Azioni multiple Storefront" className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm" id="storefront-bulk-form">
        {model.selectedShopId ? <input name="shop_id" type="hidden" value={model.selectedShopId} /> : null}
        <button className={buttonClassName} disabled={!model.permissions.canBulkPublish} formAction={bulkPublishStorefrontAction}>Pubblica selezionati</button>
        <button className={secondaryButtonClassName} disabled={!model.permissions.canBulkPublish} formAction={bulkPauseStorefrontAction}>Metti in pausa</button>
        <p className="self-center text-xs text-zinc-500">Le operazioni multiple sono atomiche e limitate a 100 righe.</p>
      </form>
      <section aria-label="Pubblicazioni Storefront" className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
          <div>
            <h2 className="font-semibold text-zinc-950">Pubblicazioni</h2>
            <p className="text-xs text-zinc-500">Vista responsive con editor e anteprima cliente affiancati su schermi ampi.</p>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-zinc-700">{model.pagination.total} prodotti</span>
        </div>
        {model.rows.length === 0 ? (
          <div className="p-8 text-center"><h2 className="font-semibold">Nessun prodotto trovato</h2><p className="mt-1 text-sm text-zinc-500">Modifica i filtri o verifica la mappatura inventario del negozio.</p></div>
        ) : model.rows.map((row) => (
          <article className="border-b border-zinc-200 last:border-b-0" key={row.sourceProductId}>
            <div className="grid gap-3 p-4 md:grid-cols-[auto_minmax(0,2fr)_repeat(4,minmax(0,1fr))] md:items-center">
              <input aria-label={`Seleziona ${row.publicName ?? row.operationalName ?? row.barcode}`} className="size-5 rounded border-zinc-300 accent-emerald-800 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2" disabled={!row.publicationId || !model.permissions.canBulkPublish} form="storefront-bulk-form" name="publicationIds" type="checkbox" value={row.publicationId ?? ""} />
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
      <nav aria-label="Paginazione pubblicazioni" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3 text-sm">
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
  const categories = root && Array.isArray(root.categories) ? root.categories : [];
  return (
    <section className="grid gap-4 rounded-[2rem] border-8 border-zinc-900 bg-zinc-50 p-5 shadow-xl md:mx-auto md:max-w-md" aria-label="Anteprima mobile cliente">
      <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Anteprima cliente</p><h2 className="text-xl font-semibold">Storefront</h2></div><span aria-label={root?.status === "ok" ? "Contratto disponibile" : "Contratto non disponibile"} className={`size-3 rounded-full ${root?.status === "ok" ? "bg-emerald-500" : "bg-amber-500"}`} role="status" /></div>
      <div aria-hidden="true" className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-500 shadow-sm">Cerca prodotti e categorie</div>
      <div className="rounded-xl bg-emerald-900 p-4 text-white"><p className="text-sm">Catalogo pubblico</p><p className="mt-1 text-2xl font-semibold">{root?.status === "ok" ? "Disponibile" : "Non disponibile"}</p><p className="mt-2 text-xs text-emerald-100">{categories.length} categorie · {items.length} in evidenza · {offers.length} offerte</p></div>
      {categories.length > 0 ? <div><h3 className="font-semibold">Categorie</h3><div className="mt-2 flex gap-2 overflow-hidden">{categories.slice(0, 4).map((category, index) => { const value = jsonObject(category); const label = typeof value?.name === "string" ? value.name : "Categoria"; return <span className="whitespace-nowrap rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-medium" key={index}>{label}</span>; })}</div></div> : null}
      <div><div className="flex items-center justify-between gap-2"><h3 className="font-semibold">In evidenza</h3><span className="text-xs text-zinc-500">{items.length}</span></div><div className="mt-2 grid grid-cols-2 gap-2">{items.slice(0, 4).map((item, index) => <PreviewCard item={item} key={index} />)}</div>{items.length === 0 ? <p className="mt-2 text-sm text-zinc-500">Nessun prodotto in evidenza.</p> : null}</div>
      <div><div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Offerte</h3><span className="text-xs text-zinc-500">{offers.length}</span></div><div className="mt-2 grid grid-cols-2 gap-2">{offers.slice(0, 4).map((item, index) => <PreviewCard item={item} key={index} />)}</div>{offers.length === 0 ? <p className="mt-2 text-sm text-zinc-500">Nessuna offerta attiva.</p> : null}</div>
      {items.length === 0 && offers.length === 0 ? <p className="rounded-md border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-500">Nessun prodotto pubblico nel contratto Home v1.</p> : null}
      <p className="text-xs text-zinc-500">Questa anteprima usa il payload restituito da storefront_home_v1, lo stesso contratto del client.</p>
    </section>
  );
}

function PreviewCard({ item }: { item: Json }) {
  const value = jsonObject(item);
  const name = typeof value?.name === "string" ? value.name : "Prodotto";
  const price = typeof value?.priceClp === "number" ? value.priceClp : null;
  const compareAtPrice = typeof value?.compareAtPriceClp === "number" ? value.compareAtPriceClp : null;
  const discountBps = typeof value?.discountBps === "number" ? value.discountBps : null;
  const availability = typeof value?.availability === "string" ? value.availability : null;
  const images = jsonObject(value?.images);
  const card = typeof images?.card === "string" ? images.card : null;
  return <article className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">{card ? <div className="relative aspect-square overflow-hidden rounded-lg bg-zinc-100"><Image alt={name} className="object-cover" fill sizes="(min-width: 768px) 180px, 44vw" src={card} unoptimized /></div> : <p className="text-xs text-zinc-500">Immagine non disponibile</p>}<p className="mt-2 line-clamp-2 text-sm font-medium">{name}</p><p className="mt-1 text-base font-semibold text-zinc-950">{clp(price)}</p>{compareAtPrice !== null && price !== null && compareAtPrice > price ? <p className="text-xs text-zinc-500 line-through">{clp(compareAtPrice)}</p> : null}<div className="mt-2 flex flex-wrap gap-1">{discountBps !== null && discountBps > 0 ? <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-[0.6875rem] font-semibold text-fuchsia-900">{discountBps / 100}% off</span> : null}{availability ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[0.6875rem] font-medium text-emerald-800">{publicationAvailabilityLabel(availability)}</span> : null}</div></article>;
}

function dateTimeInZone(value: string | undefined, timeZone: string) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function PromotionEditor({
  model,
  promotion,
}: {
  model: StorefrontPublicationsReadModel;
  promotion?: StorefrontPromotionRow;
}) {
  const selected = new Set(promotion?.publicationIds ?? []);
  const excluded = new Set(promotion?.excludedPublicationIds ?? []);
  const percentage = promotion?.discountType === "percentage_bps"
    ? promotion.discountValue / 100
    : 10;
  const fixedPrice = promotion?.discountType === "fixed_price_clp"
    ? promotion.discountValue
    : 0;
  return (
    <form action={saveStorefrontPromotionAction} className="grid gap-4 rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
      {model.selectedShopId ? <input name="shop_id" type="hidden" value={model.selectedShopId} /> : null}
      {promotion ? <input name="promotionId" type="hidden" value={promotion.id} /> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-1 text-xs font-medium text-zinc-700 md:col-span-2">
          Nome promozione
          <input className={fieldClassName} defaultValue={promotion?.publicName ?? ""} maxLength={160} name="publicName" required />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Stato promozione
          <select className={fieldClassName} defaultValue={promotion?.publicationStatus ?? "draft"} name="publicationStatus">
            <option value="draft">Bozza</option>
            <option value="scheduled">Programmata</option>
            <option value="active">Attiva</option>
            <option value="paused">In pausa</option>
            <option value="ended">Terminata</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Priorità
          <input className={fieldClassName} defaultValue={promotion?.priority ?? 0} max={100000} min={-100000} name="priority" required step={1} type="number" />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700 md:col-span-2 xl:col-span-4">
          Descrizione pubblica
          <textarea className="min-h-20 rounded-md border border-zinc-300 bg-white p-3 text-sm outline-none focus:border-emerald-700" defaultValue={promotion?.publicDescription ?? ""} maxLength={2000} name="publicDescription" />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Tipo sconto
          <select className={fieldClassName} defaultValue={promotion?.discountType ?? "percentage_bps"} name="discountType">
            <option value="percentage_bps">Percentuale</option>
            <option value="fixed_price_clp">Prezzo fisso CLP</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Sconto percentuale
          <input className={fieldClassName} defaultValue={percentage} max={100} min={1} name="discountPercentage" step={1} type="number" />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Prezzo fisso CLP
          <input className={fieldClassName} defaultValue={fixedPrice} min={0} name="fixedPriceClp" step={1} type="number" />
        </label>
        <p className="self-end text-xs leading-5 text-zinc-500">Viene usato solo il valore coerente con il tipo selezionato. Il server rifiuta percentuali o prezzi non realmente scontati.</p>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Inizio
          <input className={fieldClassName} defaultValue={dateTimeInZone(promotion?.startsAt, "America/Santiago")} name="startsAt" required type="datetime-local" />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Fine
          <input className={fieldClassName} defaultValue={dateTimeInZone(promotion?.endsAt, "America/Santiago")} name="endsAt" required type="datetime-local" />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Fuso orario
          <select className={fieldClassName} defaultValue="America/Santiago" name="timeZone"><option value="America/Santiago">America/Santiago</option><option value="UTC">UTC</option></select>
        </label>
      </div>
      <fieldset className="grid max-h-80 gap-2 overflow-auto rounded-md border border-zinc-200 p-3">
        <legend className="px-1 text-xs font-semibold text-zinc-700">Prodotti e esclusioni</legend>
        {model.promotionPublications.length === 0 ? <p className="text-sm text-zinc-500">Pubblica almeno un prodotto prima di programmare una promozione.</p> : model.promotionPublications.map((publication) => (
          <div className="grid gap-2 rounded-md border border-zinc-100 p-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center" key={publication.id}>
            <div><p className="font-medium">{publication.name}</p><p className="text-xs text-zinc-500">{clp(publication.retailPriceClp)} · {publication.status}</p></div>
            <label><input defaultChecked={selected.has(publication.id)} name="publicationIds" type="checkbox" value={publication.id} /> <span className="ml-1">Includi {publication.name}</span></label>
            <label><input defaultChecked={excluded.has(publication.id)} name="excludedPublicationIds" type="checkbox" value={publication.id} /> <span className="ml-1">Escludi {publication.name}</span></label>
          </div>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button className={buttonClassName} disabled={!model.permissions.canManagePromotions} type="submit">{promotion ? "Aggiorna promozione" : "Crea promozione"}</button>
        <p className="text-xs text-zinc-500">Riconciliazione automatica ogni minuto; validità ricalcolata anche dal contratto pubblico.</p>
      </div>
    </form>
  );
}

function Promotions({ model, params }: { model: StorefrontPublicationsReadModel; params: Record<string, string | string[] | undefined> }) {
  const shopId = param(params, "shop_id");
  return (
    <div className="grid gap-5">
      {!model.permissions.canManagePromotions ? <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Permesso storefront.promotions.manage richiesto per modificare.</p> : null}
      <form className="grid gap-3 rounded-md border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_12rem_auto]" method="get">
        {shopId ? <input name="shop_id" type="hidden" value={shopId} /> : null}
        <input name="area" type="hidden" value="promotions" />
        <label className="grid gap-1 text-xs font-medium text-zinc-700">Cerca promozione<input className={fieldClassName} defaultValue={param(params, "promotion_q")} maxLength={160} name="promotion_q" /></label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">Stato<select className={fieldClassName} defaultValue={param(params, "promotion_status") ?? ""} name="promotion_status"><option value="">Tutti</option><option value="draft">Bozza</option><option value="scheduled">Programmata</option><option value="active">Attiva</option><option value="paused">In pausa</option><option value="ended">Terminata</option></select></label>
        <div className="flex items-end"><button className={buttonClassName} type="submit">Filtra</button></div>
      </form>
      <section className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><p className="font-semibold">Regola conflitti deterministica</p><p className="mt-1">Vince il prezzo effettivo più basso; a parità, la priorità maggiore e infine l’UUID. Esclusioni e finestre temporali sono rivalidate server-side.</p><p className="mt-1 text-xs">Contratto: {model.promotionConflictRule}</p></section>
      <details className="rounded-md border border-zinc-200 bg-zinc-50 p-4" open={model.promotions.length === 0}><summary className="cursor-pointer font-semibold">Nuova promozione</summary><div className="mt-4"><PromotionEditor model={model} /></div></details>
      {model.promotions.length === 0 ? <section className="rounded-md border border-dashed border-zinc-300 bg-white p-8 text-center"><h2 className="font-semibold">Nessuna promozione</h2><p className="mt-1 text-sm text-zinc-500">Crea una promozione programmata per uno o più prodotti.</p></section> : model.promotions.map((promotion) => (
        <article className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm" key={promotion.id}>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{promotion.publicName}</h2><p className="mt-1 text-sm text-zinc-500">{promotion.discountType === "percentage_bps" ? `${promotion.discountValue / 100}%` : clp(promotion.discountValue)} · {promotion.productCount} prodotti · {promotion.excludedCount} esclusi</p></div><div className="flex gap-2"><span className={`rounded-md border px-2 py-1 text-xs font-semibold ${statusTone(promotion.effectiveStatus)}`}>{promotion.effectiveStatus}</span>{promotion.conflictProductCount > 0 ? <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900">{promotion.conflictProductCount} conflitti risolti</span> : null}</div></div>
          <p className="mt-2 text-xs text-zinc-500">{promotion.startsAt} → {promotion.endsAt} · priorità {promotion.priority}</p>
          <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold text-emerald-800">Modifica promozione</summary><div className="mt-4"><PromotionEditor model={model} promotion={promotion} /></div></details>
        </article>
      ))}
      <nav aria-label="Paginazione promozioni" className="flex items-center justify-between rounded-md border border-zinc-200 bg-white p-3 text-sm"><Link aria-disabled={model.promotionPagination.page <= 1} className={secondaryButtonClassName} href={buildHref(params, { promotion_page: Math.max(1, model.promotionPagination.page - 1) })}>Precedente</Link><span>Pagina {model.promotionPagination.page} di {model.promotionPagination.totalPages} · {model.promotionPagination.total} promozioni</span><Link aria-disabled={model.promotionPagination.page >= model.promotionPagination.totalPages} className={secondaryButtonClassName} href={buildHref(params, { promotion_page: Math.min(model.promotionPagination.totalPages, model.promotionPagination.page + 1) })}>Successiva</Link></nav>
    </div>
  );
}

function FulfillmentEnabledBadge({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
        enabled
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-zinc-200 bg-zinc-100 text-zinc-600"
      }`}
    >
      {enabled ? "Attivo" : "In pausa"}
    </span>
  );
}

function PickupPointEditor({
  canManage,
  point,
  shopId,
}: {
  canManage: boolean;
  point?: StorefrontPickupPoint;
  shopId: string;
}) {
  return (
    <form
      action={saveStorefrontPickupPointAction}
      className="grid gap-3"
    >
      <input name="shop_id" type="hidden" value={shopId} />
      {point ? (
        <input name="pickupPointId" type="hidden" value={point.id} />
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Nome pubblico
          <input
            className={fieldClassName}
            defaultValue={point?.publicName ?? ""}
            maxLength={120}
            name="publicName"
            required
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Indirizzo
          <input
            className={fieldClassName}
            defaultValue={point?.addressLine1 ?? ""}
            maxLength={200}
            name="addressLine1"
            required
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Dettaglio indirizzo
          <input
            className={fieldClassName}
            defaultValue={point?.addressLine2 ?? ""}
            maxLength={200}
            name="addressLine2"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Comune
          <input
            className={fieldClassName}
            defaultValue={point?.commune ?? ""}
            maxLength={100}
            name="commune"
            required
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Regione
          <input
            className={fieldClassName}
            defaultValue={point?.region ?? "Metropolitana"}
            maxLength={100}
            name="region"
            required
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Ordine
          <input
            className={fieldClassName}
            defaultValue={point?.sortRank ?? 0}
            name="sortRank"
            required
            step={1}
            type="number"
          />
        </label>
      </div>
      <label className="grid gap-1 text-xs font-medium text-zinc-700">
        Istruzioni pubbliche
        <textarea
          className="min-h-20 rounded-lg border border-zinc-300 bg-white p-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
          defaultValue={point?.publicInstructions ?? ""}
          maxLength={500}
          name="publicInstructions"
        />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-zinc-800">
        <input defaultChecked={point?.enabled ?? false} name="enabled" type="checkbox" />
        Disponibile ai clienti
      </label>
      <div>
        <button className={buttonClassName} disabled={!canManage} type="submit">
          {point ? "Salva punto di ritiro" : "Crea punto di ritiro"}
        </button>
      </div>
    </form>
  );
}

function DeliveryZoneEditor({
  canManage,
  shopId,
  zone,
}: {
  canManage: boolean;
  shopId: string;
  zone?: StorefrontDeliveryZone;
}) {
  return (
    <form action={saveStorefrontDeliveryZoneAction} className="grid gap-3">
      <input name="shop_id" type="hidden" value={shopId} />
      {zone ? (
        <input name="deliveryZoneId" type="hidden" value={zone.id} />
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Nome pubblico
          <input
            className={fieldClassName}
            defaultValue={zone?.publicName ?? ""}
            maxLength={120}
            name="publicName"
            required
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Regione
          <input
            className={fieldClassName}
            defaultValue={zone?.region ?? "Metropolitana"}
            maxLength={100}
            name="region"
            required
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Tariffa CLP
          <input
            className={fieldClassName}
            defaultValue={zone?.feeClp ?? 0}
            min={0}
            name="feeClp"
            required
            step={1}
            type="number"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Ordine
          <input
            className={fieldClassName}
            defaultValue={zone?.sortRank ?? 0}
            name="sortRank"
            required
            step={1}
            type="number"
          />
        </label>
      </div>
      <label className="grid gap-1 text-xs font-medium text-zinc-700">
        Comuni serviti
        <textarea
          className="min-h-24 rounded-lg border border-zinc-300 bg-white p-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
          defaultValue={zone?.communes.join("\n") ?? ""}
          maxLength={10_000}
          name="communes"
          placeholder={"Ñuñoa\nProvidencia"}
          required
        />
        <span className="font-normal text-zinc-500">Un comune per riga, massimo 100.</span>
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-zinc-800">
        <input defaultChecked={zone?.enabled ?? false} name="enabled" type="checkbox" />
        Disponibile ai clienti
      </label>
      <div>
        <button className={buttonClassName} disabled={!canManage} type="submit">
          {zone ? "Salva zona di consegna" : "Crea zona di consegna"}
        </button>
      </div>
    </form>
  );
}

function FulfillmentSlotEditor({
  canManage,
  deliveryZones,
  mode,
  pickupPoints,
  shopId,
  slot,
}: {
  canManage: boolean;
  deliveryZones: readonly StorefrontDeliveryZone[];
  mode: StorefrontFulfillmentSlot["mode"];
  pickupPoints: readonly StorefrontPickupPoint[];
  shopId: string;
  slot?: StorefrontFulfillmentSlot;
}) {
  const parentAvailable = mode === "delivery"
    ? deliveryZones.length > 0
    : pickupPoints.length > 0;
  return (
    <form action={saveStorefrontFulfillmentSlotAction} className="grid gap-3">
      <input name="shop_id" type="hidden" value={shopId} />
      <input name="mode" type="hidden" value={mode} />
      <input name="timeZone" type="hidden" value="America/Santiago" />
      {slot ? <input name="slotId" type="hidden" value={slot.id} /> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Etichetta pubblica
          <input
            className={fieldClassName}
            defaultValue={slot?.publicLabel ?? ""}
            maxLength={120}
            name="publicLabel"
            placeholder="Domani 10:00–12:00"
            required
          />
        </label>
        {mode === "delivery" ? (
          <label className="grid gap-1 text-xs font-medium text-zinc-700">
            Zona di consegna
            <select
              className={fieldClassName}
              defaultValue={slot?.deliveryZoneId ?? ""}
              name="deliveryZoneId"
              required
            >
              <option value="">Seleziona una zona</option>
              {deliveryZones.map((zone) => (
                <option key={zone.id} value={zone.id}>{zone.publicName}</option>
              ))}
            </select>
          </label>
        ) : (
          <label className="grid gap-1 text-xs font-medium text-zinc-700">
            Punto di ritiro
            <select
              className={fieldClassName}
              defaultValue={slot?.pickupPointId ?? ""}
              name="pickupPointId"
              required
            >
              <option value="">Seleziona un punto</option>
              {pickupPoints.map((point) => (
                <option key={point.id} value={point.id}>{point.publicName}</option>
              ))}
            </select>
          </label>
        )}
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Capacità
          <input
            className={fieldClassName}
            defaultValue={slot?.capacity ?? 10}
            max={1000}
            min={1}
            name="capacity"
            required
            step={1}
            type="number"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Inizio · America/Santiago
          <input
            className={fieldClassName}
            defaultValue={dateTimeInZone(slot?.startsAt, "America/Santiago")}
            name="startsAt"
            required
            type="datetime-local"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Fine · America/Santiago
          <input
            className={fieldClassName}
            defaultValue={dateTimeInZone(slot?.endsAt, "America/Santiago")}
            name="endsAt"
            required
            type="datetime-local"
          />
        </label>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-zinc-800">
        <input defaultChecked={slot?.enabled ?? false} name="enabled" type="checkbox" />
        Finestra prenotabile
      </label>
      {!parentAvailable ? (
        <p className="text-sm text-amber-800">
          Crea prima {mode === "delivery" ? "una zona di consegna" : "un punto di ritiro"}.
        </p>
      ) : null}
      <div>
        <button
          className={buttonClassName}
          disabled={!canManage || !parentAvailable}
          type="submit"
        >
          {slot ? "Salva fascia" : "Crea fascia"}
        </button>
      </div>
    </form>
  );
}

function FulfillmentSettings({ model }: { model: StorefrontPublicationsReadModel }) {
  const { fulfillment } = model;
  const { settings } = fulfillment;
  const shopId = model.selectedShopId;
  if (!settings || !shopId) {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="font-semibold text-amber-950">Configurazione non disponibile</h2>
        <p className="mt-1 text-sm text-amber-900">
          Il negozio non ha ancora un contratto Storefront configurabile.
        </p>
      </section>
    );
  }
  const modeRows = [
    ["Ritiro", settings.pickupEnabled],
    ["Prenotazione", settings.reservationEnabled],
    ["Consegna", settings.deliveryEnabled],
  ] as const;
  return (
    <div className="grid gap-5">
      {!model.permissions.canManageFulfillment ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Permesso storefront.settings.manage richiesto per modificare ritiro e consegna.
        </p>
      ) : null}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Checkout Storefront · {settings.currencyCode}
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950">Impostazioni · Modalità cliente</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600">
              Le modalità diventano pubbliche solo quando esistono sedi, zone e fasce attive. Prezzi, tariffa e disponibilità vengono rivalidati dal server.
            </p>
          </div>
          <FulfillmentEnabledBadge enabled={settings.storefrontEnabled} />
        </div>
        <form
          action={saveStorefrontFulfillmentSettingsAction}
          className="mt-4 grid gap-3 sm:grid-cols-3"
        >
          <input name="shop_id" type="hidden" value={shopId} />
          {modeRows.map(([label, enabled]) => (
            <label
              className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 text-sm font-medium text-zinc-900"
              key={label}
            >
              {label}
              <input
                defaultChecked={enabled}
                name={`${label === "Ritiro" ? "pickup" : label === "Prenotazione" ? "reservation" : "delivery"}Enabled`}
                type="checkbox"
              />
            </label>
          ))}
          <div className="sm:col-span-3">
            <button
              className={buttonClassName}
              disabled={!model.permissions.canManageFulfillment}
              type="submit"
            >
              Salva modalità
            </button>
          </div>
        </form>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-zinc-950">Punti di ritiro</h2>
              <p className="text-sm text-zinc-500">Indirizzo e istruzioni visibili nell’app.</p>
            </div>
            <span className="text-sm font-semibold text-zinc-700">{fulfillment.pickupPoints.length}</span>
          </div>
          <div className="mt-4 grid gap-3">
            <details className="rounded-lg border border-dashed border-zinc-300 p-4" open={fulfillment.pickupPoints.length === 0}>
              <summary className="cursor-pointer font-semibold text-emerald-800">Nuovo punto di ritiro</summary>
              <div className="mt-4"><PickupPointEditor canManage={model.permissions.canManageFulfillment} shopId={shopId} /></div>
            </details>
            {fulfillment.pickupPoints.map((point) => (
              <details className="rounded-lg border border-zinc-200 p-4" key={point.id}>
                <summary className="cursor-pointer list-none">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-zinc-950">{point.publicName}</p>
                      <p className="mt-1 text-sm text-zinc-500">{point.addressLine1} · {point.commune}</p>
                    </div>
                    <FulfillmentEnabledBadge enabled={point.enabled} />
                  </div>
                </summary>
                <div className="mt-4 border-t border-zinc-100 pt-4">
                  <PickupPointEditor canManage={model.permissions.canManageFulfillment} point={point} shopId={shopId} />
                </div>
              </details>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-zinc-950">Zone di consegna</h2>
              <p className="text-sm text-zinc-500">Comuni coperti e tariffa CLP autorevole.</p>
            </div>
            <span className="text-sm font-semibold text-zinc-700">{fulfillment.deliveryZones.length}</span>
          </div>
          <div className="mt-4 grid gap-3">
            <details className="rounded-lg border border-dashed border-zinc-300 p-4" open={fulfillment.deliveryZones.length === 0}>
              <summary className="cursor-pointer font-semibold text-emerald-800">Nuova zona di consegna</summary>
              <div className="mt-4"><DeliveryZoneEditor canManage={model.permissions.canManageFulfillment} shopId={shopId} /></div>
            </details>
            {fulfillment.deliveryZones.map((zone) => (
              <details className="rounded-lg border border-zinc-200 p-4" key={zone.id}>
                <summary className="cursor-pointer list-none">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-zinc-950">{zone.publicName}</p>
                      <p className="mt-1 text-sm text-zinc-500">{clp(zone.feeClp)} · {zone.communes.length} comuni</p>
                    </div>
                    <FulfillmentEnabledBadge enabled={zone.enabled} />
                  </div>
                </summary>
                <div className="mt-4 border-t border-zinc-100 pt-4">
                  <DeliveryZoneEditor canManage={model.permissions.canManageFulfillment} shopId={shopId} zone={zone} />
                </div>
              </details>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-zinc-950">Fasce di fulfillment</h2>
            <p className="mt-1 text-sm text-zinc-500">Capacità privata, finestra pubblica e conflitti protetti durante checkout.</p>
          </div>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-semibold text-zinc-700">{fulfillment.slots.length} fasce</span>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {(["pickup", "reservation", "delivery"] as const).map((mode) => (
            <details className="rounded-lg border border-dashed border-zinc-300 p-4" key={mode}>
              <summary className="cursor-pointer font-semibold text-emerald-800">
                Nuova fascia · {mode === "pickup" ? "ritiro" : mode === "reservation" ? "prenotazione" : "consegna"}
              </summary>
              <div className="mt-4">
                <FulfillmentSlotEditor
                  canManage={model.permissions.canManageFulfillment}
                  deliveryZones={fulfillment.deliveryZones}
                  mode={mode}
                  pickupPoints={fulfillment.pickupPoints}
                  shopId={shopId}
                />
              </div>
            </details>
          ))}
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {fulfillment.slots.map((slot) => (
            <details className="rounded-lg border border-zinc-200 p-4" key={slot.id}>
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-zinc-950">{slot.publicLabel}</p>
                    <p className="mt-1 text-sm text-zinc-500">
                      {slot.mode} · {auditDate(slot.startsAt)} → {auditDate(slot.endsAt)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {slot.activeQuoteCount} quote attive su {slot.capacity} posti
                    </p>
                  </div>
                  <FulfillmentEnabledBadge enabled={slot.enabled} />
                </div>
              </summary>
              <div className="mt-4 border-t border-zinc-100 pt-4">
                <FulfillmentSlotEditor
                  canManage={model.permissions.canManageFulfillment}
                  deliveryZones={fulfillment.deliveryZones}
                  mode={slot.mode}
                  pickupPoints={fulfillment.pickupPoints}
                  shopId={shopId}
                  slot={slot}
                />
              </div>
            </details>
          ))}
          {fulfillment.slots.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 lg:col-span-2">
              Nessuna fascia configurata. Crea prima una sede o una zona, poi apri una finestra.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function PaymentSettings({ model }: { model: StorefrontPublicationsReadModel }) {
  const shopId = model.selectedShopId;
  const fulfillment = model.fulfillment.settings;
  const payment = model.payment;
  if (!shopId || !fulfillment) {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="font-semibold text-amber-950">Pagamenti non disponibili</h2>
        <p className="mt-1 text-sm text-amber-900">
          Configura prima il contratto Storefront e le modalità di fulfillment.
        </p>
      </section>
    );
  }
  const pickupCompatible =
    fulfillment.pickupEnabled || fulfillment.reservationEnabled;
  const deliveryCompatible = fulfillment.deliveryEnabled;
  return (
    <div className="grid gap-5">
      {!model.permissions.canManagePayments ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Permesso storefront.settings.manage richiesto per modificare i metodi di pagamento.
        </p>
      ) : null}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Incasso Storefront · CLP
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950">
              Metodi accettati
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600">
              Il totale resta autorevole sul server. La selezione del cliente non crea una vendita fiscale e non marca l’ordine come pagato.
            </p>
          </div>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-700">
            Revisione {payment.revision}
          </span>
        </div>
        <form
          action={saveStorefrontPaymentSettingsAction}
          className="mt-5 grid gap-3"
        >
          <input name="shop_id" type="hidden" value={shopId} />
          <input
            name="expectedRevision"
            type="hidden"
            value={payment.revision}
          />
          <label className="flex min-h-14 items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900">
            <span>
              <span className="block font-semibold">Pagamento al ritiro</span>
              <span className="mt-0.5 block text-zinc-600">
                Disponibile per ritiro e prenotazione configurati.
              </span>
            </span>
            <input
              defaultChecked={payment.payAtPickupEnabled}
              disabled={!pickupCompatible || !model.permissions.canManagePayments}
              name="payAtPickupEnabled"
              type="checkbox"
            />
          </label>
          <label className="flex min-h-14 items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900">
            <span>
              <span className="block font-semibold">Contanti alla consegna</span>
              <span className="mt-0.5 block text-zinc-600">
                Opt-in e disponibile soltanto per una zona di consegna attiva.
              </span>
            </span>
            <input
              defaultChecked={payment.cashOnDeliveryEnabled}
              disabled={!deliveryCompatible || !model.permissions.canManagePayments}
              name="cashOnDeliveryEnabled"
              type="checkbox"
            />
          </label>
          <div className="flex min-h-14 items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-zinc-100 px-4 py-3 text-sm text-zinc-700">
            <span>
              <span className="block font-semibold text-zinc-900">Pagamento online</span>
              <span className="mt-0.5 block">
                Provider e credenziali merchant non configurati.
              </span>
            </span>
            <span className="rounded-full bg-zinc-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-700">
              OFF
            </span>
          </div>
          {!pickupCompatible && !deliveryCompatible ? (
            <p className="text-sm text-amber-800">
              Attiva prima almeno una modalità nella sezione Ritiro e consegna.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              className={buttonClassName}
              disabled={
                !model.permissions.canManagePayments ||
                (!pickupCompatible && !deliveryCompatible)
              }
              type="submit"
            >
              Salva metodi
            </button>
            {payment.updatedAt ? (
              <p className="text-xs text-zinc-500">
                Ultimo aggiornamento {auditDate(payment.updatedAt)}
              </p>
            ) : (
              <p className="text-xs text-zinc-500">
                Configurazione iniziale fail-closed.
              </p>
            )}
          </div>
        </form>
      </section>
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <h2 className="font-semibold text-emerald-950">Confine di pagamento</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-emerald-900">
          Ordine cliente, stato di incasso e vendita fiscale POS sono registri distinti. Un metodo offline resta dovuto fino alla conferma operativa autorizzata.
        </p>
      </section>
    </div>
  );
}

function PlaceholderArea({ area, model }: { area: "categories"; model: StorefrontPublicationsReadModel }) {
  const descriptions: Record<typeof area, string> = {
    categories: "Le categorie pubbliche disponibili sono già validate e usate dall’editor prodotto. La gestione completa viene attivata in TASK-007/TASK-008 senza esporre la tassonomia interna.",
  };
  const counts: Record<typeof area, string> = {
    categories: `${model.categories.length} categorie`,
  };
  return <section className="rounded-md border border-zinc-200 bg-white p-6 shadow-sm"><p className="text-xs font-semibold uppercase text-emerald-700">{counts[area]}</p><h2 className="mt-2 text-xl font-semibold">{areas.find(([key]) => key === area)?.[1]}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">{descriptions[area]}</p></section>;
}

function auditDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Data non disponibile";
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(date);
}

function Audit({ model }: { model: StorefrontPublicationsReadModel }) {
  if (!model.permissions.canViewAudit) return <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Permesso storefront.audit.view richiesto.</p>;
  return <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm"><div className="border-b border-zinc-200 p-4"><h2 className="font-semibold">Audit Storefront</h2><p className="text-sm text-zinc-500">Attore, operazione e snapshot pubblico prima/dopo; nessun secret.</p></div>{model.audit.length === 0 ? <p className="p-6 text-sm text-zinc-500">Nessun evento Storefront.</p> : <ul aria-label="Timeline audit Storefront">{model.audit.map((event) => <li className="grid gap-3 border-b border-zinc-100 p-4 text-sm md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(11rem,1fr)]" key={event.id}><div className="min-w-0"><p className="text-xs text-zinc-500">Evento</p><p className="font-medium [overflow-wrap:anywhere]">{event.eventKey}</p></div><div className="min-w-0"><p className="text-xs text-zinc-500">Attore</p><p className="[overflow-wrap:anywhere]">{event.actorKind}</p></div><div><p className="text-xs text-zinc-500">Esito</p><p>{event.result} · {event.updatedCount ?? 1} righe</p></div><div><p className="text-xs text-zinc-500">Quando</p><time dateTime={event.createdAt} title={event.createdAt}>{auditDate(event.createdAt)}</time></div></li>)}</ul>}</section>;
}

export default async function StorefrontPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const area = areaParam(param(params, "area"));
  const expectedFulfillmentTargetId =
    area === "settings" && param(params, "result") === "success"
      ? param(params, "target_id")
      : undefined;
  const model = await getStorefrontPublicationsReadModel({
    availability: param(params, "availability"),
    discounted: booleanParam(param(params, "discounted")),
    expectedFulfillmentTargetId,
    missingImage: booleanParam(param(params, "missing_image")),
    page: integerParam(param(params, "page"), 1),
    pageSize: integerParam(param(params, "pageSize"), 25),
    promotionPage: integerParam(param(params, "promotion_page"), 1),
    promotionPageSize: integerParam(param(params, "promotion_page_size"), 25),
    promotionQuery: param(params, "promotion_q"),
    promotionStatus: param(params, "promotion_status"),
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
      <nav aria-label="Sezioni Storefront" className="sticky top-0 z-20 flex gap-2 overflow-x-auto rounded-xl border border-zinc-200 bg-white/95 p-2 shadow-sm backdrop-blur">{areas.map(([key, label]) => <Link aria-current={area === key ? "page" : undefined} className={`min-h-11 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 ${area === key ? "bg-emerald-800 text-white" : "text-zinc-700 hover:bg-zinc-100"}`} href={buildHref(params, { area: key, page: null })} key={key}>{label}</Link>)}</nav>
      {model.status !== "ready" ? <section className="rounded-md border border-amber-200 bg-amber-50 p-5"><h2 className="font-semibold text-amber-950">Storefront non disponibile</h2><p className="mt-1 text-sm text-amber-900">{model.reason}</p></section> : area === "catalog" ? <Catalog model={model} params={params} /> : area === "promotions" ? <Promotions model={model} params={params} /> : area === "images" ? <StorefrontImagesControl canManage={model.permissions.canManageImages} candidates={model.imageCandidates} images={model.images} shopId={model.selectedShopId!} /> : area === "preview" ? <Preview preview={model.preview} /> : area === "settings" ? <FulfillmentSettings model={model} /> : area === "payments" ? <PaymentSettings model={model} /> : area === "audit" ? <Audit model={model} /> : <PlaceholderArea area={area} model={model} />}
    </div>
  );
}
