"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ShopPosRevenueSummary = {
  cardClp: number;
  cashClp: number;
  changeGivenClp: number;
  documentedRevenueClp: number;
  latestLedgerAt: string | null;
  netRevenueClp: number;
  otherClp: number;
  refundCount: number;
  saleCount: number;
  stockWarningCount: number;
  ticketAverageClp: number;
  transactionCount: number;
  transferClp: number;
  verificationRevenueClp: number;
  voidCount: number;
};

type ShopPosRevenueDailyRow = ShopPosRevenueSummary & {
  businessDate: string;
};

type ShopPosRevenueMonthlyRow = ShopPosRevenueSummary & {
  month: string;
};

type ShopPosRevenueSaleRow = {
  businessDate: string | null;
  clientOriginalSaleId: string | null;
  clientSaleId: string;
  device: string;
  fiscalStatus: string;
  occurredAt: string;
  paymentSummary: string;
  posSaleId: string;
  saleKind: string;
  saleNumber: string | null;
  staff: string;
  status: string;
  stockStatus: string;
  stockWarningCount: number;
  totalClp: number;
};

type ShopPosRevenueReadModel = {
  filters: {
    month: string;
    today: string;
    year: string;
  };
  month: {
    days: readonly ShopPosRevenueDailyRow[];
    summary: ShopPosRevenueSummary;
  };
  recentSales: readonly ShopPosRevenueSaleRow[];
  realtime: {
    deviceCount: number;
    lastSyncAt: string | null;
    staleAfterSeconds: number;
    status: "live" | "offline" | "stale";
  };
  reason: string;
  selectedShop: {
    shopName: string;
  } | null;
  status: string;
  stockWarnings: readonly {
    createdAt: string;
    issueCode: string | null;
    movementKind: string;
    productId: string | null;
    quantityDelta: number;
    status: string;
    stockAfter: number | null;
    stockBefore: number | null;
  }[];
  syncBatches: readonly {
    clientBatchId: string;
    receivedAt: string;
    saleCount: number;
    status: string;
    syncBatchId: string;
  }[];
  today: ShopPosRevenueSummary;
  year: {
    months: readonly ShopPosRevenueMonthlyRow[];
    summary: ShopPosRevenueSummary;
  };
};

type Props = {
  initialData: ShopPosRevenueReadModel;
  month: string;
  shopId?: string;
  year: string;
};

type SaleDetailLine = {
  barcode: string | null;
  entryType: string;
  lineTotalClp: number;
  productName: string | null;
  quantity: number;
  unitPriceClp: number;
};

type SaleDetailState =
  | { status: "idle" }
  | { status: "loading" }
  | { lines: SaleDetailLine[]; status: "ready" }
  | { message: string; status: "error" };

const currencyFormatter = new Intl.NumberFormat("es-CL", {
  currency: "CLP",
  maximumFractionDigits: 0,
  style: "currency",
});

const dateTimeFormatter = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "short",
  timeStyle: "short",
});

function money(value: number) {
  return currencyFormatter.format(value);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Sin datos";
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp)
    ? dateTimeFormatter.format(new Date(timestamp))
    : "Sin datos";
}

function toneForRealtime(status: ShopPosRevenueReadModel["realtime"]["status"]) {
  if (status === "live") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }

  if (status === "stale") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  return "border-rose-200 bg-rose-50 text-rose-900";
}

function realtimeLabel(status: ShopPosRevenueReadModel["realtime"]["status"]) {
  if (status === "live") {
    return "Live";
  }

  if (status === "stale") {
    return "Stale";
  }

  return "Offline";
}

function metricClass(tone: "good" | "neutral" | "warning") {
  if (tone === "good") {
    return "border-emerald-200 bg-emerald-50";
  }

  if (tone === "warning") {
    return "border-amber-200 bg-amber-50";
  }

  return "border-slate-200 bg-white";
}

function MetricCard({
  detail,
  label,
  tone = "neutral",
  value,
}: {
  detail: string;
  label: string;
  tone?: "good" | "neutral" | "warning";
  value: string;
}) {
  return (
    <div className={`rounded-md border p-4 ${metricClass(tone)}`}>
      <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-sm text-slate-600">{detail}</p>
    </div>
  );
}

function SummaryGrid({ summary }: { summary: ShopPosRevenueSummary }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        detail="Incluye todas las ventas reales del POS."
        label="Incasso completo"
        tone="good"
        value={money(summary.netRevenueClp)}
      />
      <MetricCard
        detail="Ventas con documento compatible."
        label="Incasso documentado"
        value={money(summary.documentedRevenueClp)}
      />
      <MetricCard
        detail="Diferencia visible para revisión."
        label="Da verificare"
        tone={summary.verificationRevenueClp === 0 ? "neutral" : "warning"}
        value={money(summary.verificationRevenueClp)}
      />
      <MetricCard
        detail={`${summary.transactionCount} ventas, ticket medio ${money(summary.ticketAverageClp)}.`}
        label="Vendite"
        value={`${summary.transactionCount}`}
      />
      <MetricCard
        detail={`Cambio entregado: ${money(summary.changeGivenClp)}.`}
        label="Cash"
        value={money(summary.cashClp)}
      />
      <MetricCard detail="Pagos con tarjeta." label="Card" value={money(summary.cardClp)} />
      <MetricCard
        detail={`Transfer ${money(summary.transferClp)} · Other ${money(summary.otherClp)}.`}
        label="Transfer / Other"
        value={money(summary.transferClp + summary.otherClp)}
      />
      <MetricCard
        detail={`${summary.refundCount} refund · ${summary.voidCount} void.`}
        label="Refund / Void"
        tone={summary.refundCount + summary.voidCount > 0 ? "warning" : "neutral"}
        value={`${summary.refundCount + summary.voidCount}`}
      />
    </div>
  );
}

function buildRevenueUrl(input: {
  month: string;
  shopId?: string;
  year: string;
}) {
  const params = new URLSearchParams({
    month: input.month,
    year: input.year,
  });

  if (input.shopId) {
    params.set("shop_id", input.shopId);
  }

  return `/api/shop/pos/revenue?${params.toString()}`;
}

function saleDetailUrl(input: { posSaleId: string; shopId?: string }) {
  const params = new URLSearchParams({
    pos_sale_id: input.posSaleId,
  });

  if (input.shopId) {
    params.set("shop_id", input.shopId);
  }

  return `/api/shop/pos/revenue/sale-detail?${params.toString()}`;
}

export function PosRevenueDashboard({
  initialData,
  month: initialMonth,
  shopId,
  year: initialYear,
}: Props) {
  const [data, setData] = useState(initialData);
  const [month, setMonth] = useState(initialMonth);
  const [year, setYear] = useState(initialYear);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
  const [saleDetails, setSaleDetails] = useState<Record<string, SaleDetailState>>({});
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    if (document.hidden) {
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsRefreshing(true);

    try {
      const response = await fetch(buildRevenueUrl({ month, shopId, year }), {
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        return;
      }

      const nextData = (await response.json()) as ShopPosRevenueReadModel;
      setData(nextData);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setData((current) => ({
          ...current,
          realtime: {
            ...current.realtime,
            status: "offline",
          },
        }));
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [month, shopId, year]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void fetchData();
    }, 0);

    return () => {
      window.clearTimeout(id);
    };
  }, [fetchData]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void fetchData();
    }, 10_000);

    return () => {
      window.clearInterval(id);
      abortRef.current?.abort();
    };
  }, [fetchData]);

  const loadSaleDetail = useCallback(
    async (sale: ShopPosRevenueSaleRow) => {
      const saleId = sale.posSaleId;

      setExpandedSaleId((current) => (current === saleId ? null : saleId));

      if (saleDetails[saleId]?.status === "ready") {
        return;
      }

      setSaleDetails((current) => ({
        ...current,
        [saleId]: { status: "loading" },
      }));

      try {
        const response = await fetch(saleDetailUrl({ posSaleId: saleId, shopId }), {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("detail_request_failed");
        }

        const payload = (await response.json()) as { lines: SaleDetailLine[] };
        setSaleDetails((current) => ({
          ...current,
          [saleId]: { lines: payload.lines, status: "ready" },
        }));
      } catch {
        setSaleDetails((current) => ({
          ...current,
          [saleId]: {
            message: "Detalle no disponible.",
            status: "error",
          },
        }));
      }
    },
    [saleDetails, shopId],
  );

  const statusClass = useMemo(
    () => toneForRealtime(data.realtime.status),
    [data.realtime.status],
  );

  if (data.status !== "ready") {
    return (
      <section className="rounded-md border border-amber-200 bg-amber-50 p-5 text-amber-950">
        <p className="font-semibold">Incassi POS non disponibili</p>
        <p className="mt-1 text-sm">{data.reason}</p>
      </section>
    );
  }

  return (
    <div className="grid gap-5">
      <header className="grid gap-4 rounded-md border border-slate-200 bg-white p-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
            Shop Admin / POS
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">
            Incassi POS
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Incasso completo gestionale, vista documentata e differenze da
            verificare per {data.selectedShop?.shopName}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-md border px-3 py-2 text-sm font-medium ${statusClass}`}>
            {realtimeLabel(data.realtime.status)}
          </span>
          <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Aggiornato: {formatDateTime(data.realtime.lastSyncAt)}
          </span>
          <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {isRefreshing ? "Refresh..." : `${data.realtime.deviceCount} POS`}
          </span>
        </div>
      </header>

      <section className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Oggi</h2>
            <p className="text-sm text-slate-600">{data.filters.today}</p>
          </div>
          {data.today.stockWarningCount > 0 ? (
            <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {data.today.stockWarningCount} warning stock
            </span>
          ) : null}
        </div>
        <SummaryGrid summary={data.today} />
      </section>

      <section className="grid gap-3 rounded-md border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Vendite recenti</h2>
            <p className="text-sm text-slate-600">
              Dettaglio bounded delle ultime vendite sincronizzate.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[960px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-normal text-slate-500">
                <th className="py-2 pr-3">Ora</th>
                <th className="py-2 pr-3">Vendita</th>
                <th className="py-2 pr-3">Staff</th>
                <th className="py-2 pr-3">Device</th>
                <th className="py-2 pr-3">Totale</th>
                <th className="py-2 pr-3">Documento</th>
                <th className="py-2 pr-3">Stock</th>
                <th className="py-2 pr-3">Dettaglio</th>
              </tr>
            </thead>
            <tbody>
              {data.recentSales.map((sale) => {
                const detail = saleDetails[sale.posSaleId] ?? { status: "idle" };
                const expanded = expandedSaleId === sale.posSaleId;

                return (
                  <tr className="border-b border-slate-100 align-top" key={sale.posSaleId}>
                    <td className="py-3 pr-3">{formatDateTime(sale.occurredAt)}</td>
                    <td className="py-3 pr-3">
                      <p className="font-medium text-slate-950">
                        {sale.saleNumber ?? sale.clientSaleId}
                      </p>
                      <p className="text-xs text-slate-500">{sale.saleKind}</p>
                    </td>
                    <td className="py-3 pr-3">{sale.staff}</td>
                    <td className="py-3 pr-3">{sale.device}</td>
                    <td className="py-3 pr-3 font-medium">{money(sale.totalClp)}</td>
                    <td className="py-3 pr-3">{sale.fiscalStatus}</td>
                    <td className="py-3 pr-3">
                      {sale.stockStatus}
                      {sale.stockWarningCount > 0 ? ` (${sale.stockWarningCount})` : ""}
                    </td>
                    <td className="py-3 pr-3">
                      <button
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                        onClick={() => void loadSaleDetail(sale)}
                        type="button"
                      >
                        {expanded ? "Chiudi" : "Apri"}
                      </button>
                      {expanded ? (
                        <div className="mt-3 min-w-[320px] rounded-md border border-slate-200 bg-slate-50 p-3">
                          {detail.status === "loading" ? (
                            <p className="text-sm text-slate-600">Caricamento...</p>
                          ) : detail.status === "error" ? (
                            <p className="text-sm text-rose-700">{detail.message}</p>
                          ) : detail.status === "ready" ? (
                            <div className="grid gap-2">
                              {detail.lines.map((line, index) => (
                                <div
                                  className="grid gap-1 border-b border-slate-200 pb-2 last:border-0 last:pb-0"
                                  key={`${sale.posSaleId}-${index}`}
                                >
                                  <p className="font-medium text-slate-900">
                                    {line.productName ?? line.barcode ?? "Riga vendita"}
                                  </p>
                                  <p className="text-xs text-slate-600">
                                    Qty {line.quantity} · {money(line.unitPriceClp)} ·{" "}
                                    {money(line.lineTotalClp)} · {line.entryType}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {data.recentSales.length === 0 ? (
                <tr>
                  <td className="py-6 text-center text-slate-500" colSpan={8}>
                    Nessuna vendita POS sincronizzata.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 rounded-md border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Storico mensile</h2>
            <p className="text-sm text-slate-600">Totali giornalieri del mese selezionato.</p>
          </div>
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) => setMonth(event.target.value)}
            type="month"
            value={month}
          />
        </div>
        <SummaryGrid summary={data.month.summary} />
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-normal text-slate-500">
                <th className="py-2 pr-3">Giorno</th>
                <th className="py-2 pr-3">Completo</th>
                <th className="py-2 pr-3">Documentato</th>
                <th className="py-2 pr-3">Da verificare</th>
                <th className="py-2 pr-3">Vendite</th>
                <th className="py-2 pr-3">Warning</th>
              </tr>
            </thead>
            <tbody>
              {data.month.days.map((day) => (
                <tr className="border-b border-slate-100" key={day.businessDate}>
                  <td className="py-2 pr-3">{day.businessDate}</td>
                  <td className="py-2 pr-3">{money(day.netRevenueClp)}</td>
                  <td className="py-2 pr-3">{money(day.documentedRevenueClp)}</td>
                  <td className="py-2 pr-3">{money(day.verificationRevenueClp)}</td>
                  <td className="py-2 pr-3">{day.transactionCount}</td>
                  <td className="py-2 pr-3">{day.stockWarningCount}</td>
                </tr>
              ))}
              {data.month.days.length === 0 ? (
                <tr>
                  <td className="py-5 text-center text-slate-500" colSpan={6}>
                    Nessun incasso nel mese selezionato.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 rounded-md border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Storico annuale</h2>
            <p className="text-sm text-slate-600">Trend mensile dell&apos;anno selezionato.</p>
          </div>
          <input
            className="w-28 rounded-md border border-slate-300 px-3 py-2 text-sm"
            max="2100"
            min="2020"
            onChange={(event) => setYear(event.target.value)}
            type="number"
            value={year}
          />
        </div>
        <SummaryGrid summary={data.year.summary} />
        <div className="grid gap-2">
          {data.year.months.map((row) => (
            <div
              className="grid gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-[120px_1fr_1fr_1fr_80px]"
              key={row.month}
            >
              <span className="font-medium text-slate-950">{row.month}</span>
              <span>Completo {money(row.netRevenueClp)}</span>
              <span>Documentato {money(row.documentedRevenueClp)}</span>
              <span>Da verificare {money(row.verificationRevenueClp)}</span>
              <span>{row.stockWarningCount} warn</span>
            </div>
          ))}
          {data.year.months.length === 0 ? (
            <p className="rounded-md border border-slate-200 p-4 text-center text-sm text-slate-500">
              Nessun incasso nell&apos;anno selezionato.
            </p>
          ) : null}
        </div>
      </section>

      <section className="grid gap-3 rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-950">Sync e warning stock</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-md border border-slate-200 p-3">
            <h3 className="font-semibold text-slate-900">Ultimi batch</h3>
            <div className="mt-3 grid gap-2">
              {data.syncBatches.slice(0, 6).map((batch) => (
                <div className="rounded-md bg-slate-50 p-3 text-sm" key={batch.syncBatchId}>
                  <p className="font-medium text-slate-900">{batch.clientBatchId}</p>
                  <p className="text-slate-600">
                    {batch.status} · {batch.saleCount} vendite · {formatDateTime(batch.receivedAt)}
                  </p>
                </div>
              ))}
              {data.syncBatches.length === 0 ? (
                <p className="text-sm text-slate-500">Nessun batch ricevuto.</p>
              ) : null}
            </div>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <h3 className="font-semibold text-slate-900">Warning stock</h3>
            <div className="mt-3 grid gap-2">
              {data.stockWarnings.slice(0, 6).map((warning) => (
                <div
                  className="rounded-md bg-amber-50 p-3 text-sm text-amber-950"
                  key={`${warning.createdAt}-${warning.productId ?? "product"}`}
                >
                  <p className="font-medium">{warning.status}</p>
                  <p>
                    {warning.movementKind} · delta {warning.quantityDelta} ·{" "}
                    {warning.issueCode ?? "review"}
                  </p>
                </div>
              ))}
              {data.stockWarnings.length === 0 ? (
                <p className="text-sm text-slate-500">Nessun warning stock.</p>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
