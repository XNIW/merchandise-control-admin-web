"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  configureDeliveryTrackingAction,
  controlCourierTrackingAction,
  manageDeliverySessionAction,
  publishCourierLocationAction,
  type DeliveryActionResult,
} from "./actions";
import {
  createBrowserForegroundGeolocationAdapter,
  shouldPublishForegroundLocation,
  type ForegroundGeolocationAdapter,
  type ForegroundLocationSample,
} from "./foreground-geolocation";

type DeliveryCourierOption = {
  displayLabel: string;
  staffCode: string;
  staffId: string;
};

type DeliveryTrackingRow = {
  courierPublicLabel: string | null;
  destinationSummary: {
    addressLine1: string | null;
    addressLine2: string | null;
    commune: string | null;
    region: string | null;
  } | null;
  lastObservedAt: string | null;
  orderCode: string;
  orderId: string;
  orderStatus: string;
  trackingMode: "externalCarrier" | "liveCourier" | "statusOnly" | null;
  trackingState: string | null;
};

type Props = {
  canManage: boolean;
  couriers: DeliveryCourierOption[];
  isCourier: boolean;
  rows: DeliveryTrackingRow[];
  shopId: string;
  trackingEnabled: boolean;
};

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(new Date(value));
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function resultTone(result: DeliveryActionResult | null) {
  if (!result) return "text-zinc-600";
  return result.ok ? "text-emerald-700" : "text-red-700";
}

export function CourierModeClient({
  canManage,
  couriers,
  isCourier,
  rows,
  shopId,
  trackingEnabled,
}: Props) {
  const adapter = useMemo(
    () => createBrowserForegroundGeolocationAdapter(),
    [],
  );
  const watchIdRef = useRef<number | null>(null);
  const adapterRef = useRef<ForegroundGeolocationAdapter | null>(adapter);
  const lastPublishedRef = useRef<ForegroundLocationSample | null>(null);
  const activeOrderIdRef = useRef<string | null>(null);
  const publishingRef = useRef(false);
  const [selectedOrderId, setSelectedOrderId] = useState(rows[0]?.orderId ?? "");
  const [mode, setMode] = useState<
    "externalCarrier" | "liveCourier" | "statusOnly"
  >("liveCourier");
  const [selectedCourierId, setSelectedCourierId] = useState(
    couriers[0]?.staffId ?? "",
  );
  const [result, setResult] = useState<DeliveryActionResult | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [lastPublishedAt, setLastPublishedAt] = useState<string | null>(null);
  const [pageVisible, setPageVisible] = useState(true);

  const stopLocalWatch = useCallback(() => {
    if (watchIdRef.current !== null && adapterRef.current) {
      adapterRef.current.stop(watchIdRef.current);
    }
    watchIdRef.current = null;
    activeOrderIdRef.current = null;
    publishingRef.current = false;
    lastPublishedRef.current = null;
    setIsSharing(false);
  }, []);

  useEffect(() => {
    const updateVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  useEffect(() => stopLocalWatch, [stopLocalWatch]);

  const publishSample = useCallback(
    async (sample: ForegroundLocationSample) => {
      const orderId = activeOrderIdRef.current;
      if (!orderId || document.hidden || publishingRef.current) return;
      if (
        !shouldPublishForegroundLocation(lastPublishedRef.current, sample, {
          minDistanceMeters: 25,
          minIntervalMilliseconds: 10000,
        })
      ) {
        return;
      }
      publishingRef.current = true;
      const nextResult = await publishCourierLocationAction({
        ...sample,
        orderId,
        shopId,
      });
      publishingRef.current = false;
      setResult(nextResult);
      if (nextResult.ok) {
        lastPublishedRef.current = sample;
        setLastPublishedAt(sample.observedAt);
      } else if (
        nextResult.code === "assignment_denied" ||
        nextResult.code === "invalid_state" ||
        nextResult.code === "session_expired"
      ) {
        stopLocalWatch();
      }
    },
    [shopId, stopLocalWatch],
  );

  const startSharing = useCallback(
    async (orderId: string) => {
      if (!adapterRef.current) {
        setResult({
          code: "geolocation_unavailable",
          message: "La geolocalizzazione non è disponibile in questo browser.",
          ok: false,
        });
        return;
      }
      setIsPending(true);
      const nextResult = await controlCourierTrackingAction({
        operation: "start",
        orderId,
        shopId,
      });
      setResult(nextResult);
      setIsPending(false);
      if (!nextResult.ok) return;

      stopLocalWatch();
      activeOrderIdRef.current = orderId;
      watchIdRef.current = adapterRef.current.start({
        onError: (message) =>
          setResult({ code: "geolocation_error", message, ok: false }),
        onLocation: (sample) => void publishSample(sample),
      });
      setIsSharing(true);
    },
    [publishSample, shopId, stopLocalWatch],
  );

  const pauseOrStop = useCallback(
    async (operation: "pause" | "stop") => {
      const orderId = activeOrderIdRef.current;
      if (!orderId) return;
      setIsPending(true);
      stopLocalWatch();
      const nextResult = await controlCourierTrackingAction({
        operation,
        orderId,
        shopId,
      });
      setResult(nextResult);
      setIsPending(false);
    },
    [shopId, stopLocalWatch],
  );

  const manageSession = useCallback(
    async (operation: "start" | "terminate", orderId: string) => {
      setIsPending(true);
      const nextResult = await manageDeliverySessionAction({
        operation,
        orderId,
        shopId,
      });
      setResult(nextResult);
      setIsPending(false);
    },
    [shopId],
  );

  const configure = useCallback(async () => {
    if (!selectedOrderId) return;
    const form = document.querySelector<HTMLFormElement>("#delivery-config-form");
    const data = form ? new FormData(form) : new FormData();
    const number = (key: string) => {
      const value = String(data.get(key) ?? "").trim();
      return value ? Number(value) : undefined;
    };
    const text = (key: string) => {
      const value = String(data.get(key) ?? "").trim();
      return value || undefined;
    };
    const iso = (key: string) => {
      const value = text(key);
      return value ? new Date(value).toISOString() : undefined;
    };
    setIsPending(true);
    const nextResult = await configureDeliveryTrackingAction({
      contactCapability: "none",
      courierPublicLabel: text("courierPublicLabel"),
      courierStaffId: mode === "liveCourier" ? selectedCourierId : undefined,
      destinationLatitude: number("destinationLatitude"),
      destinationLongitude: number("destinationLongitude"),
      etaEndsAt: iso("etaEndsAt"),
      etaStartsAt: iso("etaStartsAt"),
      externalCarrier: text("externalCarrier"),
      externalTrackingCodeMasked: text("externalTrackingCodeMasked"),
      externalTrackingUrl: text("externalTrackingUrl"),
      mode,
      orderId: selectedOrderId,
      shopId,
      storeLatitude: number("storeLatitude"),
      storeLongitude: number("storeLongitude"),
      vehicleKind: text("vehicleKind"),
    });
    setResult(nextResult);
    setIsPending(false);
  }, [mode, selectedCourierId, selectedOrderId, shopId]);

  return (
    <div className="grid gap-5">
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              Consegne attive
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-300">
              La condivisione usa la posizione del browser solo dopo Avvia. È una
              capability foreground: browser e sistema operativo possono sospenderla
              quando la pagina non è visibile o lo schermo è spento.
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${trackingEnabled ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
            {trackingEnabled ? "Tracking abilitato" : "Tracking disattivato"}
          </span>
        </div>
        {!pageVisible && isSharing ? (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="status">
            Pagina non visibile: nessun nuovo campione viene inviato finché non torni in foreground.
          </p>
        ) : null}
        {rows.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-zinc-300 p-5 text-sm text-zinc-600">
            Nessuna consegna assegnata o attiva.
          </p>
        ) : (
          <div className="mt-4 grid gap-3">
            {rows.map((row) => (
              <article key={row.orderId} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs text-zinc-500">{row.orderCode}</p>
                    <h3 className="mt-1 font-semibold text-zinc-950 dark:text-zinc-50">
                      {statusLabel(row.orderStatus)}
                    </h3>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                      {[
                        row.destinationSummary?.addressLine1,
                        row.destinationSummary?.commune,
                        row.destinationSummary?.region,
                      ].filter(Boolean).join(" · ") || "Destinazione non pubblicata"}
                    </p>
                  </div>
                  <div className="text-right text-xs text-zinc-500">
                    <p>{row.trackingMode ?? "Non configurato"}</p>
                    <p>{row.trackingState ?? "unavailable"}</p>
                    <p>Ultimo aggiornamento: {formatDateTime(row.lastObservedAt)}</p>
                  </div>
                </div>
                {isCourier ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      className="min-h-12 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
                      disabled={isPending || isSharing || row.orderStatus !== "out_for_delivery"}
                      onClick={() => void startSharing(row.orderId)}
                      type="button"
                    >
                      Avvia condivisione
                    </button>
                    <button
                      className="min-h-12 rounded-lg border border-zinc-300 px-4 text-sm font-semibold disabled:opacity-50"
                      disabled={isPending || !isSharing}
                      onClick={() => void pauseOrStop("pause")}
                      type="button"
                    >
                      Pausa
                    </button>
                    <button
                      className="min-h-12 rounded-lg border border-red-300 px-4 text-sm font-semibold text-red-700 disabled:opacity-50"
                      disabled={isPending || !isSharing}
                      onClick={() => void pauseOrStop("stop")}
                      type="button"
                    >
                      Stop
                    </button>
                  </div>
                ) : null}
                {canManage && row.trackingState ? (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                    {row.trackingMode === "liveCourier" &&
                    row.orderStatus === "out_for_delivery" &&
                    (row.trackingState === "assigned" ||
                      row.trackingState === "paused") ? (
                      <button
                        className="min-h-12 rounded-lg border border-emerald-300 px-4 text-sm font-semibold text-emerald-800 disabled:opacity-50"
                        disabled={isPending}
                        onClick={() => void manageSession("start", row.orderId)}
                        type="button"
                      >
                        Avvia sessione
                      </button>
                    ) : null}
                    {row.trackingState !== "completed" &&
                    row.trackingState !== "cancelled" ? (
                      <button
                        className="min-h-12 rounded-lg border border-red-300 px-4 text-sm font-semibold text-red-700 disabled:opacity-50"
                        disabled={isPending}
                        onClick={() =>
                          void manageSession("terminate", row.orderId)
                        }
                        type="button"
                      >
                        Termina tracking
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
        {lastPublishedAt ? (
          <p className="mt-3 text-sm text-zinc-600" role="status">
            Ultimo campione accettato localmente: {formatDateTime(lastPublishedAt)}.
            Le coordinate non vengono mostrate né registrate nella UI.
          </p>
        ) : null}
        {result ? (
          <p className={`mt-3 text-sm font-medium ${resultTone(result)}`} role="status">
            {result.message}
          </p>
        ) : null}
      </section>

      {canManage ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-semibold">Configura tracking</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            ETA e modalità sono server-authoritative. Le coordinate sono opzionali e
            devono provenire da una configurazione reale del negozio/destinazione.
          </p>
          <form className="mt-4 grid gap-4 md:grid-cols-2" id="delivery-config-form" onSubmit={(event) => { event.preventDefault(); void configure(); }}>
            <label className="grid gap-1 text-sm font-medium">
              Ordine
              <select className="min-h-12 rounded-lg border border-zinc-300 px-3" value={selectedOrderId} onChange={(event) => setSelectedOrderId(event.target.value)}>
                {rows.map((row) => <option key={row.orderId} value={row.orderId}>{row.orderCode} · {statusLabel(row.orderStatus)}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Modalità
              <select className="min-h-12 rounded-lg border border-zinc-300 px-3" value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
                <option value="statusOnly">Solo stato</option>
                <option value="externalCarrier">Vettore esterno</option>
                <option value="liveCourier">Corriere live</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">Inizio finestra prevista<input className="min-h-12 rounded-lg border border-zinc-300 px-3" name="etaStartsAt" type="datetime-local" /></label>
            <label className="grid gap-1 text-sm font-medium">Fine finestra prevista<input className="min-h-12 rounded-lg border border-zinc-300 px-3" name="etaEndsAt" type="datetime-local" /></label>
            {mode === "liveCourier" ? (
              <>
                <label className="grid gap-1 text-sm font-medium">Corriere assegnato<select className="min-h-12 rounded-lg border border-zinc-300 px-3" value={selectedCourierId} onChange={(event) => setSelectedCourierId(event.target.value)}><option value="">Seleziona</option>{couriers.map((courier) => <option key={courier.staffId} value={courier.staffId}>{courier.displayLabel}</option>)}</select></label>
                <label className="grid gap-1 text-sm font-medium">Alias pubblico<input className="min-h-12 rounded-lg border border-zinc-300 px-3" maxLength={80} name="courierPublicLabel" placeholder="Repartidor MC" /></label>
                <label className="grid gap-1 text-sm font-medium">Veicolo<select className="min-h-12 rounded-lg border border-zinc-300 px-3" name="vehicleKind"><option value="bicycle">Bicicletta</option><option value="motorcycle">Moto</option><option value="car">Auto</option><option value="van">Furgone</option><option value="walking">A piedi</option></select></label>
                <label className="grid gap-1 text-sm font-medium">Latitudine negozio<input className="min-h-12 rounded-lg border border-zinc-300 px-3" name="storeLatitude" step="any" type="number" /></label>
                <label className="grid gap-1 text-sm font-medium">Longitudine negozio<input className="min-h-12 rounded-lg border border-zinc-300 px-3" name="storeLongitude" step="any" type="number" /></label>
                <label className="grid gap-1 text-sm font-medium">Latitudine destinazione<input className="min-h-12 rounded-lg border border-zinc-300 px-3" name="destinationLatitude" step="any" type="number" /></label>
                <label className="grid gap-1 text-sm font-medium">Longitudine destinazione<input className="min-h-12 rounded-lg border border-zinc-300 px-3" name="destinationLongitude" step="any" type="number" /></label>
              </>
            ) : null}
            {mode === "externalCarrier" ? (
              <>
                <label className="grid gap-1 text-sm font-medium">Vettore<input className="min-h-12 rounded-lg border border-zinc-300 px-3" maxLength={80} name="externalCarrier" /></label>
                <label className="grid gap-1 text-sm font-medium">Codice mascherato<input className="min-h-12 rounded-lg border border-zinc-300 px-3" maxLength={40} name="externalTrackingCodeMasked" placeholder="****1234" /></label>
                <label className="grid gap-1 text-sm font-medium md:col-span-2">URL tracking HTTPS<input className="min-h-12 rounded-lg border border-zinc-300 px-3" maxLength={2048} name="externalTrackingUrl" type="url" /></label>
              </>
            ) : null}
            <button className="min-h-12 rounded-lg bg-emerald-700 px-4 font-semibold text-white disabled:opacity-50 md:col-span-2" disabled={isPending || !selectedOrderId} type="submit">Salva configurazione</button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
