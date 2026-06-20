"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type HistoryDetailField = {
  key: string;
  label: string;
  value: string;
};

type HistoryDetailModalRow = {
  rowKey: string;
  rowNumber: string;
  itemCode: string;
  barcode: string;
  productName: string;
  quantity: string;
  purchasePrice: string;
  retailPrice: string;
  completion: string;
  productId: string | null;
  productLabel: string | null;
};

type HistoryDetailModalReadModel = {
  status: string;
  reason: string;
  detail: {
    entryId: string;
    kind: "sync_event" | "shared_sheet_session";
    title: string;
    source: string;
    sourceDeviceId: string | null;
    eventType: string;
    tableSummary: string;
    recordCount: number;
    payloadSummary: string;
    rawJsonPreview: string;
    createdAt: string;
    fields: HistoryDetailField[];
    sessionAnalysis: {
      completeCount: number;
      missingCount: number;
      rowCount: number;
      state: "active" | "tombstone";
      updatedAt: string;
    } | null;
  } | null;
  rows: HistoryDetailModalRow[];
  missingRows: HistoryDetailModalRow[];
  linkedProducts: HistoryDetailModalRow[];
  syncEvents: Array<{
    eventId: string;
    eventType: string;
    status: "pending" | "success" | "failed";
    source: string | null;
    sourceDeviceId: string | null;
    changedCount: number;
    clientEventId: string | null;
    createdAt: string;
  }>;
};

type HistoryTab = "rows" | "missing" | "products" | "sync";
type HistoryRowFilter = "all" | "completed" | "ignored" | "missing";

const tabs: Array<{ key: HistoryTab; label: string }> = [
  { key: "rows", label: "Rows preview" },
  { key: "missing", label: "Missing / errors" },
  { key: "products", label: "Linked products" },
  { key: "sync", label: "Sync events" },
];

type TranslateFn = (value: string) => string;

const identityTranslate: TranslateFn = (value) => value;

function fieldValue(
  value: string | number | null | undefined,
  translate: TranslateFn = identityTranslate,
) {
  return value === null || value === undefined || value === ""
    ? translate("Not set")
    : String(value);
}

function formatDate(
  value: string | null | undefined,
  translate: TranslateFn = identityTranslate,
) {
  if (!value) {
    return translate("Not set");
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function detailField(
  readModel: HistoryDetailModalReadModel | null,
  key: string,
) {
  return readModel?.detail?.fields.find((field) => field.key === key)?.value ?? "Not set";
}

function isUnresolvedValue(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();

  return (
    normalized === "" ||
    normalized === "not resolved" ||
    normalized === "not set" ||
    normalized === "overlay unavailable" ||
    normalized === "unknown"
  );
}

function displayCell(value: string | null | undefined) {
  return isUnresolvedValue(value) ? "-" : String(value);
}

function isIgnoredHistoryRow(row: HistoryDetailModalRow) {
  if (row.rowNumber !== "1") {
    return false;
  }

  const tokens = [
    row.itemCode,
    row.barcode,
    row.productName,
    row.quantity,
    row.purchasePrice,
    row.retailPrice,
  ]
    .join(" ")
    .toLowerCase();
  const headerMatches = [
    "barcode",
    "item",
    "product",
    "quantity",
    "purchase",
    "retail",
  ].filter((token) => tokens.includes(token));

  return headerMatches.length >= 2;
}

function rowFilterKind(row: HistoryDetailModalRow): HistoryRowFilter {
  if (isIgnoredHistoryRow(row)) {
    return "ignored";
  }

  return row.productId || row.completion === "Complete" ? "completed" : "missing";
}

function countRowsByKind(rows: readonly HistoryDetailModalRow[]) {
  return rows.reduce(
    (counts, row) => {
      const kind = rowFilterKind(row);
      counts[kind] += 1;
      counts.all += 1;

      return counts;
    },
    { all: 0, completed: 0, ignored: 0, missing: 0 },
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <article className="min-w-0 rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
        {label}
      </p>
      <p className="mt-2 break-words text-lg font-semibold text-zinc-950 [overflow-wrap:anywhere]">
        {value}
      </p>
    </article>
  );
}

function HistorySkeleton() {
  return (
    <div className="grid gap-4 p-5" data-history-detail-loading>
      <div className="h-7 w-2/5 rounded-md bg-zinc-200" />
      <div className="grid gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div className="h-20 rounded-md bg-zinc-100" key={item} />
        ))}
      </div>
      <div className="h-80 rounded-md bg-zinc-100" />
    </div>
  );
}

function RowsTable({
  filter,
  labels,
  onFilterChange,
  rows,
  showFilters = true,
}: {
  filter: HistoryRowFilter;
  labels?: Record<string, string>;
  onFilterChange: (filter: HistoryRowFilter) => void;
  rows: readonly HistoryDetailModalRow[];
  showFilters?: boolean;
}) {
  const translate = (value: string) => labels?.[value] ?? value;
  const counts = countRowsByKind(rows);
  const visibleRows =
    filter === "all" ? rows : rows.filter((row) => rowFilterKind(row) === filter);
  const filters: Array<{ key: HistoryRowFilter; label: string; show?: boolean }> = [
    { key: "all", label: "All" },
    { key: "missing", label: "Missing" },
    { key: "completed", label: "Completed" },
    { key: "ignored", label: "Ignored", show: counts.ignored > 0 },
  ];

  return (
    <div className="grid gap-3">
      {showFilters ? (
      <div className="flex min-w-0 flex-wrap gap-2" aria-label={translate("Row filters")}>
        {filters
          .filter((item) => item.show ?? true)
          .map((item) => (
            <button
              aria-pressed={filter === item.key}
              className={[
                "inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-semibold",
                filter === item.key
                  ? "border-emerald-700 bg-emerald-50 text-emerald-800"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300",
              ].join(" ")}
              key={item.key}
              onClick={() => onFilterChange(item.key)}
              type="button"
            >
              {translate(item.label)} {counts[item.key]}
            </button>
          ))}
      </div>
      ) : null}
      <div className="max-h-[min(52vh,34rem)] overflow-auto rounded-md border border-zinc-200">
      <table className="w-full min-w-[72rem] text-left text-sm">
        <thead className="sticky top-0 z-10 bg-zinc-50 text-xs uppercase tracking-normal text-zinc-500">
          <tr>
            <th className="px-3 py-2">{translate("No.")}</th>
            <th className="px-3 py-2">{translate("Item code")}</th>
            <th className="px-3 py-2">{translate("Barcode")}</th>
            <th className="px-3 py-2">{translate("Product name")}</th>
            <th className="px-3 py-2">{translate("Quantity")}</th>
            <th className="px-3 py-2">{translate("Purchase")}</th>
            <th className="px-3 py-2">{translate("Retail")}</th>
            <th className="px-3 py-2">{translate("Completed / Missing")}</th>
            <th className="px-3 py-2">{translate("Product detail")}</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.length > 0 ? (
            visibleRows.map((row) => {
              const kind = rowFilterKind(row);
              const status =
                kind === "ignored"
                  ? translate("Ignored header row")
                  : kind === "completed"
                    ? translate("Completed")
                    : translate("Missing");

              return (
              <tr className="border-t border-zinc-100" key={row.rowKey}>
                <td className="px-3 py-2 font-mono text-xs">{row.rowNumber}</td>
                <td className="max-w-40 truncate px-3 py-2 font-mono text-xs" title={displayCell(row.itemCode)}>
                  {displayCell(row.itemCode)}
                </td>
                <td className="max-w-44 truncate px-3 py-2 font-mono text-xs" title={displayCell(row.barcode)}>
                  {displayCell(row.barcode)}
                </td>
                <td className="max-w-72 truncate px-3 py-2" title={displayCell(row.productName)}>
                  {displayCell(row.productName)}
                </td>
                <td className="px-3 py-2">{displayCell(row.quantity)}</td>
                <td className="px-3 py-2">{displayCell(row.purchasePrice)}</td>
                <td className="px-3 py-2">{displayCell(row.retailPrice)}</td>
                <td className="px-3 py-2">
                  <span
                    className={[
                      "inline-flex rounded-md border px-2 py-1 text-xs font-semibold",
                      kind === "ignored"
                        ? "border-zinc-200 bg-zinc-50 text-zinc-700"
                        : kind === "completed"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-amber-200 bg-amber-50 text-amber-800",
                    ].join(" ")}
                  >
                    {status}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {row.productId && kind !== "ignored" ? (
                    <a
                      className="inline-flex h-8 items-center rounded-md border border-zinc-300 px-2.5 text-xs font-medium text-zinc-900 hover:border-emerald-400 hover:text-emerald-800"
                      data-product-detail-id={row.productId}
                      data-product-detail-trigger
                      href={`/shop/products/${encodeURIComponent(row.productId)}`}
                    >
                      {translate("Detail")}
                    </a>
                  ) : (
                    <span
                      aria-disabled="true"
                      className="inline-flex h-8 items-center rounded-md border border-zinc-200 px-2.5 text-xs font-medium text-zinc-500"
                      title={translate("Product not resolved from barcode or item code")}
                    >
                      {kind === "ignored" ? translate("Ignored") : translate("No product match")}
                    </span>
                  )}
                </td>
              </tr>
              );
            })
          ) : (
            <tr>
              <td className="px-3 py-5 text-zinc-500" colSpan={9}>
                {translate("No bounded row data is available for this entry.")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}

export function HistoryDetailModalController({
  labels,
  requestedShopId,
}: {
  labels?: Record<string, string>;
  requestedShopId?: string | null;
}) {
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<HistoryTab>("rows");
  const [rowFilter, setRowFilter] = useState<HistoryRowFilter>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readModel, setReadModel] = useState<HistoryDetailModalReadModel | null>(null);
  const detail = readModel?.detail ?? null;
  const translate = useCallback((value: string) => labels?.[value] ?? value, [labels]);
  const titleId = "history-detail-modal-title";

  const loadEntry = useCallback(
    async (entryId: string) => {
      const params = new URLSearchParams({ entry_id: entryId });

      if (requestedShopId) {
        params.set("shop_id", requestedShopId);
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/shop/history/detail?${params.toString()}`, {
          cache: "no-store",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        const body = (await response.json()) as HistoryDetailModalReadModel;

        if (!response.ok || body.status !== "ready") {
          setReadModel(body);
          setError(body.reason || "History detail is not available.");
          return;
        }

        setReadModel(body);
      } catch {
        setError("History detail could not be loaded.");
      } finally {
        setLoading(false);
      }
    },
    [requestedShopId],
  );

  const openEntry = useCallback(
    (entryId: string) => {
      setOpen(true);
      setTab("rows");
      setRowFilter("all");
      setReadModel(null);
      void loadEntry(entryId);
    },
    [loadEntry],
  );
  const closeModal = useCallback(() => {
    setOpen(false);
    window.setTimeout(() => lastTriggerRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      const trigger = target.closest("[data-history-detail-trigger]");

      if (!(trigger instanceof HTMLElement)) {
        return;
      }

      const entryId = trigger.dataset.historyDetailId;

      if (!entryId) {
        return;
      }

      event.preventDefault();
      lastTriggerRef.current = trigger;
      openEntry(entryId);
    };

    document.addEventListener("click", onClick);

    return () => document.removeEventListener("click", onClick);
  }, [openEntry]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeModal();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeModal, open]);

  const summaryCards = useMemo(() => {
    const rows = readModel?.rows ?? [];
    const rowCounts = countRowsByKind(rows);
    const completed =
      detail?.sessionAnalysis?.completeCount ?? rowCounts.completed;
    const missing =
      detail?.sessionAnalysis?.missingCount ?? readModel?.missingRows.length ?? 0;
    const rowsInFile =
      detail?.sessionAnalysis?.rowCount ?? detail?.recordCount ?? rows.length;
    const sourceValue = detail?.sourceDeviceId ?? detail?.source ?? null;

    return [
      {
        label: translate("Products detected"),
        value: String(readModel?.linkedProducts.length ?? 0),
      },
      {
        label: translate("Rows in file"),
        value: String(rowsInFile),
      },
      {
        label: translate("Completed"),
        value: String(completed),
      },
      {
        label: translate("Missing products"),
        value: String(missing),
      },
      {
        label: detail?.sourceDeviceId ? translate("Device") : translate("Source"),
        value: fieldValue(sourceValue, translate),
      },
    ];
  }, [detail, readModel, translate]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden bg-zinc-950/35 p-0 sm:p-6">
      <div className="flex min-h-full min-w-0 items-center justify-center">
        <section
          aria-label={translate("History entry detail")}
          aria-labelledby={titleId}
          aria-modal="true"
          className="flex h-dvh max-h-dvh w-full min-w-0 flex-col overflow-hidden rounded-none bg-white shadow-xl sm:h-auto sm:max-h-[calc(100dvh-48px)] sm:w-[min(1120px,calc(100vw-48px))] sm:rounded-md xl:w-[min(1200px,calc(100vw-72px))]"
          role="dialog"
        >
          {loading && !readModel ? (
            <HistorySkeleton />
          ) : (
            <>
              <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white">
                <div className="flex min-w-0 flex-col gap-3 px-4 py-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <h2
                      className="line-clamp-2 break-words text-xl font-semibold leading-7 text-zinc-950 [overflow-wrap:anywhere]"
                      id={titleId}
                      title={detail?.title ?? translate("History entry detail")}
                    >
                      {detail?.title ?? translate("History entry detail")}
                    </h2>
                    <p className="mt-1 break-words text-sm text-zinc-600 [overflow-wrap:anywhere]">
                      {fieldValue(detailField(readModel, "supplier"), translate)} / {fieldValue(detailField(readModel, "category"), translate)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="inline-flex rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800">
                        {detail?.kind === "sync_event"
                          ? translate("Sync event")
                          : translate("History entry")}
                      </span>
                      <span className="inline-flex rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-semibold text-zinc-700">
                        {translate("Created")} {formatDate(detail?.createdAt, translate)}
                      </span>
                      <span
                        className={[
                          "inline-flex rounded-md border px-2 py-1 text-xs font-semibold",
                          detail?.sessionAnalysis?.state === "tombstone"
                            ? "border-amber-200 bg-amber-50 text-amber-800"
                            : "border-emerald-200 bg-emerald-50 text-emerald-800",
                        ].join(" ")}
                      >
                        {detail?.sessionAnalysis?.state === "tombstone"
                          ? translate("Deleted")
                          : detail?.kind === "sync_event"
                            ? translate("Synced")
                            : translate("Active")}
                      </span>
                    </div>
                  </div>
                  <button
                    className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800"
                    onClick={closeModal}
                    type="button"
                  >
                    {translate("Close")}
                  </button>
                </div>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                {error ? (
                  <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                    {error}
                  </p>
                ) : null}
                {detail ? (
                  <div className="grid gap-5">
                    <section className="grid gap-3 md:grid-cols-5">
                      {summaryCards.map((card) => (
                        <SummaryCard key={card.label} label={card.label} value={card.value} />
                      ))}
                    </section>

                    <nav
                      aria-label={translate("History detail tabs")}
                      className="flex min-w-0 gap-2 overflow-x-auto border-b border-zinc-200"
                      role="tablist"
                    >
                      {tabs.map((item) => (
                        <button
                          aria-controls={`history-detail-panel-${item.key}`}
                          aria-selected={tab === item.key}
                          className={[
                            "h-10 shrink-0 border-b-2 px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700",
                            tab === item.key
                              ? "border-emerald-700 text-emerald-800"
                              : "border-transparent text-zinc-600 hover:text-zinc-950",
                          ].join(" ")}
                          id={`history-detail-tab-${item.key}`}
                          key={item.key}
                          onClick={() => setTab(item.key)}
                          role="tab"
                          type="button"
                        >
                          {translate(item.label)}
                        </button>
                      ))}
                    </nav>

                    {tab === "rows" ? (
                      <section
                        aria-labelledby="history-detail-tab-rows"
                        id="history-detail-panel-rows"
                        role="tabpanel"
                      >
                        <RowsTable
                          filter={rowFilter}
                          labels={labels}
                          onFilterChange={setRowFilter}
                          rows={readModel?.rows ?? []}
                        />
                      </section>
                    ) : null}

                    {tab === "missing" ? (
                      <section
                        aria-labelledby="history-detail-tab-missing"
                        className="grid gap-4"
                        id="history-detail-panel-missing"
                        role="tabpanel"
                      >
                        {(readModel?.missingRows.length ?? 0) > 0 ? (
                          <RowsTable
                            filter="all"
                            labels={labels}
                            onFilterChange={() => undefined}
                            rows={readModel?.missingRows ?? []}
                            showFilters={false}
                          />
                        ) : (
                          <p className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                            {translate("No missing products or row errors are visible in this bounded payload.")}
                          </p>
                        )}
                        {!["None", "Not set", ""].includes(detailField(readModel, "errors")) ? (
                          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                            <p className="font-semibold text-zinc-950">{translate("Errors")}</p>
                            <p className="mt-1">{detailField(readModel, "errors")}</p>
                          </div>
                        ) : null}
                      </section>
                    ) : null}

                    {tab === "products" ? (
                      <section
                        aria-labelledby="history-detail-tab-products"
                        className="grid gap-3"
                        id="history-detail-panel-products"
                        role="tabpanel"
                      >
                        {readModel?.linkedProducts.length ? (
                          readModel.linkedProducts.map((row) => (
                            <article
                              className="grid gap-2 rounded-md border border-zinc-200 bg-white p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                              key={`${row.rowKey}:${row.productId}`}
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-zinc-950" title={row.productLabel ?? row.productName}>
                                  {displayCell(row.productLabel ?? row.productName)}
                                </p>
                                <p className="mt-1 text-xs text-zinc-600">
                                  {displayCell(row.barcode)} / {translate("row")} {row.rowNumber}
                                </p>
                              </div>
                              {row.productId ? (
                                <a
                                  className="inline-flex h-8 items-center justify-center rounded-md border border-zinc-300 px-2.5 text-xs font-medium text-zinc-900 hover:border-emerald-400 hover:text-emerald-800"
                                  data-product-detail-id={row.productId}
                                  data-product-detail-trigger
                                  href={`/shop/products/${encodeURIComponent(row.productId)}`}
                                >
                                  {translate("Product detail")}
                                </a>
                              ) : null}
                            </article>
                          ))
                        ) : (
                          <p className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                            {translate("No product shortcuts were resolved from this bounded detail payload.")}
                          </p>
                        )}
                      </section>
                    ) : null}

                    {tab === "sync" ? (
                      <section
                        aria-labelledby="history-detail-tab-sync"
                        className="overflow-x-auto rounded-md border border-zinc-200"
                        id="history-detail-panel-sync"
                        role="tabpanel"
                      >
                        <table className="w-full min-w-[56rem] text-left text-sm">
                          <thead className="bg-zinc-50 text-xs uppercase tracking-normal text-zinc-500">
                            <tr>
                              <th className="px-3 py-2">{translate("Event")}</th>
                              <th className="px-3 py-2">{translate("State")}</th>
                              <th className="px-3 py-2">{translate("Source")}</th>
                              <th className="px-3 py-2">{translate("Changed")}</th>
                              <th className="px-3 py-2">{translate("Client event")}</th>
                              <th className="px-3 py-2">{translate("Created")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {readModel?.syncEvents.length ? (
                              readModel.syncEvents.map((event) => (
                                <tr className="border-t border-zinc-100" key={event.eventId}>
                                  <td className="px-3 py-2">{event.eventType}</td>
                                  <td className="px-3 py-2">{event.status}</td>
                                  <td className="px-3 py-2">{fieldValue(event.sourceDeviceId ?? event.source, translate)}</td>
                                  <td className="px-3 py-2">{event.changedCount}</td>
                                  <td className="px-3 py-2">{displayCell(event.clientEventId)}</td>
                                  <td className="px-3 py-2">{formatDate(event.createdAt, translate)}</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td className="px-3 py-5 text-zinc-500" colSpan={6}>
                                  {translate("No related sync events are visible for this entry.")}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </section>
                    ) : null}

                    <details className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                      <summary className="cursor-pointer text-sm font-semibold text-zinc-950">
                        {translate("Redacted diagnostics")}
                      </summary>
                      <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-zinc-950 p-3 text-xs leading-5 text-zinc-100">
                        {detail.rawJsonPreview}
                      </pre>
                    </details>
                  </div>
                ) : loading ? (
                  <HistorySkeleton />
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
