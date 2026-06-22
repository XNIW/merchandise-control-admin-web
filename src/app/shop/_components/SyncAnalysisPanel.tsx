"use client";

type SyncAnalysisTone = "danger" | "good" | "neutral" | "warning";
type SyncAnalysisValue = number | string | null | undefined;

export type SyncAnalysisItem = {
  detail?: string;
  key: string;
  label: string;
  tone?: SyncAnalysisTone;
  value: SyncAnalysisValue;
};

export type SyncAnalysisHistoryEntryLink = {
  actionLabel?: string;
  description?: string;
  href: string;
  label: string;
};

export type SyncAnalysisModel = {
  description?: string;
  historyEntry?: SyncAnalysisHistoryEntryLink;
  issues: SyncAnalysisItem[];
  latestEvent: SyncAnalysisItem[];
  metrics: SyncAnalysisItem[];
  status: SyncAnalysisItem;
  title: string;
};

type SyncAnalysisLabels = Record<string, string> | undefined;

type HistoryDetailSyncEvent = {
  changedCount?: number | null;
  createdAt?: string | null;
  eventType?: string | null;
  source?: string | null;
  sourceDeviceId?: string | null;
  status?: string | null;
};

type HistoryDetailSyncAnalysisInput = {
  detail: {
    createdAt?: string | null;
    eventType?: string | null;
    fields?: readonly { key: string; value: string }[];
    kind?: string | null;
    sessionAnalysis?: {
      completeCount?: number | null;
      missingCount?: number | null;
      rowCount?: number | null;
      syncStateLabel?: string | null;
      totalQuantity?: string | null;
      updatedAt?: string | null;
    } | null;
    title?: string | null;
  } | null;
  linkedProductCount?: number | null;
  missingRowCount?: number | null;
  rowCount?: number | null;
  syncEvents?: readonly HistoryDetailSyncEvent[];
  unresolvedProductRowCount?: number | null;
};

type ImportApplySyncAnalysisInput = {
  historyEntry?: {
    action: "created" | "updated";
    displayName: string;
    href: string;
    rowCount: number;
  };
  message?: string | null;
  ok?: boolean | null;
  rowErrors?: readonly { code?: string; message?: string }[];
  summary?: {
    categoriesApplied?: number | null;
    failedRows?: number | null;
    priceHistoryApplied?: number | null;
    productsApplied?: number | null;
    suppliersApplied?: number | null;
  };
};

function firstAvailable(...values: SyncAnalysisValue[]) {
  return values.find(
    (value) => value !== null && value !== undefined && String(value).trim() !== "",
  );
}

function fieldValue(
  fields: readonly { key: string; value: string }[] | undefined,
  key: string,
) {
  return fields?.find((field) => field.key === key)?.value;
}

function issueCountByToken(
  issues: readonly { code?: string; message?: string }[] | undefined,
  tokens: readonly string[],
) {
  if (!issues?.length) {
    return null;
  }

  return issues.filter((issue) => {
    const haystack = `${issue.code ?? ""} ${issue.message ?? ""}`.toLowerCase();

    return tokens.some((token) => haystack.includes(token));
  }).length;
}

export function buildHistoryDetailSyncAnalysisModel(
  input: HistoryDetailSyncAnalysisInput,
): SyncAnalysisModel {
  const detail = input.detail;
  const session = detail?.sessionAnalysis;
  const latestEvent = input.syncEvents?.[0];
  const failedEvents =
    input.syncEvents?.filter((event) => event.status === "failed").length ?? 0;
  const rowCount = firstAvailable(session?.rowCount, input.rowCount);
  const completeRows = session?.completeCount;
  const missingRows = firstAvailable(session?.missingCount, input.missingRowCount);
  const historyChanged =
    input.syncEvents?.some((event) => event.eventType === "history_changed") ?? false;

  return {
    description: "Real data from shared_sheet_sessions and related sync_events.",
    latestEvent: [
      {
        key: "event",
        label: "Event",
        value: latestEvent?.eventType ?? detail?.eventType,
      },
      { key: "state", label: "State", value: latestEvent?.status },
      {
        key: "source",
        label: "Source",
        value: firstAvailable(latestEvent?.sourceDeviceId, latestEvent?.source),
      },
      { key: "changed", label: "Changed rows", value: latestEvent?.changedCount },
      {
        key: "created",
        label: "Created",
        value: latestEvent?.createdAt ?? detail?.createdAt,
      },
    ],
    metrics: [
      { key: "rows", label: "Total rows", value: rowCount },
      { key: "complete", label: "Complete rows", tone: "good", value: completeRows },
      {
        key: "missing",
        label: "Missing rows",
        tone: Number(missingRows ?? 0) > 0 ? "warning" : "good",
        value: missingRows,
      },
      {
        key: "linked",
        label: "Linked products",
        value: input.linkedProductCount,
      },
      {
        key: "totalQuantity",
        label: "Total quantity",
        value: session?.totalQuantity,
      },
      { key: "rowsCreated", label: "Rows created", value: null },
      { key: "rowsUpdated", label: "Rows updated", value: null },
      { key: "rowsSkipped", label: "Rows skipped", value: null },
    ],
    issues: [
      {
        key: "errorsWarnings",
        label: "Errors / warnings",
        tone: failedEvents > 0 ? "danger" : "good",
        value: failedEvents,
      },
      {
        key: "mappingProblems",
        label: "Mapping problems",
        tone: Number(input.unresolvedProductRowCount ?? 0) > 0 ? "warning" : "good",
        value: input.unresolvedProductRowCount,
      },
      {
        key: "invalidQuantityPrice",
        label: "Invalid quantity/price problems",
        value: null,
      },
      {
        key: "historyChanged",
        label: "history_changed",
        tone: historyChanged ? "good" : "neutral",
        value: historyChanged ? "Detected" : null,
      },
      {
        key: "overlay",
        label: "Overlay status",
        value: fieldValue(detail?.fields, "overlay"),
      },
    ],
    status: {
      key: "status",
      label: "Sync status",
      tone:
        failedEvents > 0
          ? "danger"
          : session?.syncStateLabel
            ? "good"
            : "neutral",
      value: session?.syncStateLabel,
    },
    title: "Sync / Import analysis",
  };
}

export function buildImportApplySyncAnalysisModel(
  input: ImportApplySyncAnalysisInput,
): SyncAnalysisModel {
  const failedRows = input.summary?.failedRows;
  const rowErrorCount = input.rowErrors?.length ?? 0;
  const hasFailures = Boolean((failedRows ?? 0) > 0 || rowErrorCount > 0);
  const invalidQuantityPrice = issueCountByToken(input.rowErrors, [
    "price",
    "quantity",
    "qty",
  ]);
  const mappingProblems = issueCountByToken(input.rowErrors, [
    "mapping",
    "column",
    "supplier",
    "category",
  ]);

  return {
    description: input.message ?? "Supplier import apply result.",
    historyEntry: input.historyEntry
      ? {
          actionLabel: "Open History Entry",
          description: `${input.historyEntry.rowCount} rows`,
          href: input.historyEntry.href,
          label: input.historyEntry.displayName,
        }
      : undefined,
    latestEvent: [
      {
        key: "event",
        label: "Event",
        value: input.historyEntry ? "history_changed" : null,
      },
      {
        key: "state",
        label: "State",
        tone: input.ok === false ? "danger" : input.ok ? "good" : "neutral",
        value: input.ok === false ? "Failed" : input.ok ? "Applied" : null,
      },
      { key: "source", label: "Source", value: "Supplier workbook apply" },
      { key: "changed", label: "Changed rows", value: input.historyEntry?.rowCount },
      { key: "created", label: "Created", value: null },
    ],
    metrics: [
      {
        key: "totalRows",
        label: "Total rows",
        value: input.historyEntry?.rowCount,
      },
      {
        key: "productsApplied",
        label: "Products applied",
        value: input.summary?.productsApplied,
      },
      {
        key: "suppliersApplied",
        label: "Suppliers applied",
        value: input.summary?.suppliersApplied,
      },
      {
        key: "categoriesApplied",
        label: "Categories applied",
        value: input.summary?.categoriesApplied,
      },
      {
        key: "priceHistoryApplied",
        label: "Price history applied",
        value: input.summary?.priceHistoryApplied,
      },
      {
        key: "rowsCreated",
        label: "Rows created",
        value: input.historyEntry?.action === "created" ? 1 : null,
      },
      {
        key: "rowsUpdated",
        label: "Rows updated",
        value: input.historyEntry?.action === "updated" ? 1 : null,
      },
      { key: "rowsSkipped", label: "Rows skipped", value: null },
    ],
    issues: [
      {
        key: "errorsWarnings",
        label: "Errors / warnings",
        tone: hasFailures ? "danger" : "good",
        value: rowErrorCount || failedRows,
      },
      {
        key: "failedRows",
        label: "Failed rows",
        tone: Number(failedRows ?? 0) > 0 ? "danger" : "good",
        value: failedRows,
      },
      {
        key: "mappingProblems",
        label: "Mapping problems",
        tone: Number(mappingProblems ?? 0) > 0 ? "warning" : "good",
        value: mappingProblems,
      },
      {
        key: "invalidQuantityPrice",
        label: "Invalid quantity/price problems",
        tone: Number(invalidQuantityPrice ?? 0) > 0 ? "warning" : "good",
        value: invalidQuantityPrice,
      },
      {
        key: "historyChanged",
        label: "history_changed",
        tone: input.historyEntry ? "good" : "neutral",
        value: input.historyEntry ? "Detected" : null,
      },
    ],
    status: {
      key: "status",
      label: "Sync status",
      tone: input.ok === false ? "danger" : input.ok ? "good" : "neutral",
      value: input.ok === false ? "Failed" : input.ok ? "Applied" : null,
    },
    title: "Sync / Import analysis",
  };
}

function translate(labels: SyncAnalysisLabels, value: string) {
  return labels?.[value] ?? value;
}

function displayValue(labels: SyncAnalysisLabels, value: SyncAnalysisValue) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return translate(labels, "Not available");
  }

  return String(value);
}

function toneClass(tone: SyncAnalysisTone | undefined) {
  if (tone === "good") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (tone === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (tone === "danger") {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }

  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function SyncAnalysisMetricCard({
  item,
  labels,
}: {
  item: SyncAnalysisItem;
  labels: SyncAnalysisLabels;
}) {
  const renderedValue = displayValue(labels, item.value);

  return (
    <div className="min-w-0 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-2">
      <dt className="truncate text-[11px] font-semibold uppercase tracking-normal text-zinc-500">
        {translate(labels, item.label)}
      </dt>
      <dd
        className={[
          "mt-1 truncate text-sm font-semibold text-zinc-950",
          item.tone === "danger"
            ? "text-rose-700"
            : item.tone === "warning"
              ? "text-amber-700"
              : item.tone === "good"
                ? "text-emerald-800"
                : "",
        ].join(" ")}
        title={renderedValue}
      >
        {translate(labels, renderedValue)}
      </dd>
      {item.detail ? (
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">
          {translate(labels, item.detail)}
        </p>
      ) : null}
    </div>
  );
}

function SyncAnalysisCompactList({
  items,
  labels,
  title,
}: {
  items: readonly SyncAnalysisItem[];
  labels: SyncAnalysisLabels;
  title: string;
}) {
  return (
    <section className="min-w-0 rounded-md border border-zinc-200 bg-white p-3">
      <h4 className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
        {translate(labels, title)}
      </h4>
      <dl className="mt-2 grid gap-1.5">
        {items.map((item) => (
          <div
            className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 text-sm"
            key={item.key}
          >
            <dt className="min-w-0 truncate text-zinc-600">
              {translate(labels, item.label)}
            </dt>
            <dd
              className={[
                "max-w-[16rem] truncate text-right font-semibold",
                item.tone === "danger"
                  ? "text-rose-700"
                  : item.tone === "warning"
                    ? "text-amber-700"
                    : item.tone === "good"
                      ? "text-emerald-800"
                      : "text-zinc-950",
              ].join(" ")}
              title={displayValue(labels, item.value)}
            >
              {translate(labels, displayValue(labels, item.value))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function SyncAnalysisPanel({
  labels,
  model,
}: {
  labels?: Record<string, string>;
  model: SyncAnalysisModel;
}) {
  return (
    <section
      className="grid min-w-0 gap-3 rounded-md border border-zinc-200 bg-white p-3"
      data-sync-analysis-panel
    >
      <header className="flex min-w-0 flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-zinc-950">
            {translate(labels, model.title)}
          </h3>
          {model.description ? (
            <p className="mt-1 text-sm leading-5 text-zinc-600">
              {translate(labels, model.description)}
            </p>
          ) : null}
        </div>
        <span
          className={[
            "inline-flex w-fit shrink-0 items-center rounded-md border px-2 py-1 text-xs font-semibold",
            toneClass(model.status.tone),
          ].join(" ")}
        >
          {translate(labels, model.status.label)}:{" "}
          {translate(labels, displayValue(labels, model.status.value))}
        </span>
      </header>

      <dl className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {model.metrics.map((item) => (
          <SyncAnalysisMetricCard item={item} key={item.key} labels={labels} />
        ))}
      </dl>

      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        <SyncAnalysisCompactList
          items={model.latestEvent}
          labels={labels}
          title="Latest sync event"
        />
        <SyncAnalysisCompactList
          items={model.issues}
          labels={labels}
          title="Warnings / problems"
        />
      </div>

      {model.historyEntry ? (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          <p className="min-w-0 truncate">
            <span className="font-semibold">{translate(labels, "History Entry")}</span>
            : {model.historyEntry.label}
            {model.historyEntry.description
              ? ` (${model.historyEntry.description})`
              : ""}
          </p>
          <a
            className="inline-flex h-8 shrink-0 items-center rounded-md border border-emerald-700 bg-white px-2.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
            href={model.historyEntry.href}
          >
            {translate(labels, model.historyEntry.actionLabel ?? "Open History Entry")}
          </a>
        </div>
      ) : null}
    </section>
  );
}
