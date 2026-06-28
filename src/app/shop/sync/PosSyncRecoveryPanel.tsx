import { SectionCard } from "@/components/admin/SectionCard";
import type { ShopPosSyncRecoveryReadModel } from "@/server/shop-admin/pos-sync-recovery-read-model";
import { recordPosSyncRecoveryActionAction } from "@/app/shop/actions";

const recoveryTableClassName =
  "min-w-full divide-y divide-zinc-200 text-left text-sm";
const recoveryThClassName =
  "px-3 py-2 text-xs font-semibold uppercase tracking-normal text-zinc-500";
const recoveryTdClassName =
  "px-3 py-2 align-top text-zinc-800 [overflow-wrap:anywhere]";

function shortId(value: string | null | undefined) {
  if (!value) {
    return "n/a";
  }

  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(new Date(value));
}

function formatClp(value: number) {
  return new Intl.NumberFormat("es-CL", {
    currency: "CLP",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function statusCountText(counts: Record<string, number>) {
  const entries = Object.entries(counts);

  return entries.length > 0
    ? entries.map(([status, count]) => `${status}: ${count}`).join(" | ")
    : "n/a";
}

function recoveryTargetOptions(model: ShopPosSyncRecoveryReadModel) {
  const options: Array<{ label: string; value: string }> = [];

  if (!model.selectedShop) {
    return options;
  }

  options.push({
    label: `Shop ${model.selectedShop.shopCode} - nota generale`,
    value: `pos_shop|${model.selectedShop.shopId}`,
  });

  if (model.latestBatch) {
    options.push({
      label: `Batch ${shortId(model.latestBatch.clientBatchId)} (${model.latestBatch.status})`,
      value: `pos_sales_sync_batch|${model.latestBatch.salesSyncBatchId}`,
    });
  }

  for (const sale of model.issueSales.slice(0, 20)) {
    options.push({
      label: `Vendita ${sale.saleNumber ?? shortId(sale.clientSaleId)} (${sale.status})`,
      value: `pos_sale|${sale.posSaleId}`,
    });
  }

  for (const warning of model.stockWarnings.slice(0, 20)) {
    options.push({
      label: `Stock ${shortId(warning.movementKey)} (${warning.status})`,
      value: `pos_sale_stock_movement|${warning.posSaleStockMovementId}`,
    });
  }

  return options;
}

function recoveryContextText(model: ShopPosSyncRecoveryReadModel) {
  const lines = [
    "POS Sync Recovery context",
    `shop=${model.selectedShop?.shopCode ?? "n/a"}`,
    `latestBatch=${model.latestBatch?.clientBatchId ?? "n/a"}`,
    `latestBatchStatus=${model.latestBatch?.status ?? "n/a"}`,
    `issueSales=${model.issueSales.length}`,
    `stockWarnings=${model.stockWarnings.length}`,
    `recentFailures=${model.recentFailures.length}`,
    `recoveryActions=${model.recoveryActions.length}`,
    "recoveryActionsPolicy=audit-only; no sales/stock/outbox mutation",
  ];

  for (const sale of model.issueSales.slice(0, 5)) {
    lines.push(
      `sale ${sale.saleNumber ?? shortId(sale.clientSaleId)} status=${sale.status} stock=${sale.stockStatus}`,
    );
  }

  for (const warning of model.stockWarnings.slice(0, 5)) {
    lines.push(
      `stock ${shortId(warning.movementKey)} status=${warning.status} issue=${warning.issueCode ?? "n/a"}`,
    );
  }

  for (const failure of model.recentFailures.slice(0, 3)) {
    lines.push(
      `auditFailure ${shortId(failure.auditLogId)} event=${failure.eventKey} metadata=${failure.metadataPreview}`,
    );
  }

  for (const action of model.recoveryActions.slice(0, 3)) {
    lines.push(
      `recoveryAction ${shortId(action.auditLogId)} action=${action.actionType} metadata=${action.metadataPreview}`,
    );
  }

  return lines.join("\n");
}

export function PosSyncRecoveryPanel({
  model,
}: {
  model: ShopPosSyncRecoveryReadModel;
}) {
  const selectedShopId = model.selectedShop?.shopId;
  const posHref = selectedShopId
    ? `/shop/pos?${new URLSearchParams({ shop_id: selectedShopId }).toString()}`
    : "/shop/pos";
  const hasIssues =
    model.issueSales.length > 0 ||
    model.recentFailures.length > 0 ||
    model.stockWarnings.length > 0;
  const actionTargets = recoveryTargetOptions(model);

  return (
    <SectionCard
      actions={
        <a
          className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800"
          href={posHref}
        >
          Vedi dettagli
        </a>
      }
      description="Vista server shop-scoped per batch POS, conflitti, stock warnings, audit failure e recovery actions append-only."
      title="POS Sync Recovery"
      titleId="pos-sync-recovery-title"
    >
      {model.status !== "ready" ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-950">
          Recovery non disponibile: {model.error?.message ?? model.reason}
        </div>
      ) : (
        <div className="grid gap-5">
          <dl className="grid gap-0 overflow-hidden rounded-md border border-zinc-200 md:grid-cols-4">
            <div className="border-b border-zinc-200 px-3 py-2 md:border-b-0 md:border-r">
              <dt className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
                Ultimo batch
              </dt>
              <dd className="mt-1 text-sm font-semibold text-zinc-950">
                {model.latestBatch
                  ? shortId(model.latestBatch.clientBatchId)
                  : "Nessun batch"}
              </dd>
              <dd className="text-xs leading-5 text-zinc-500">
                {model.latestBatch
                  ? formatTimestamp(model.latestBatch.receivedAt)
                  : "Server senza batch POS"}
              </dd>
            </div>
            <div className="border-b border-zinc-200 px-3 py-2 md:border-b-0 md:border-r">
              <dt className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
                Stato batch
              </dt>
              <dd className="mt-1 text-sm font-semibold text-zinc-950">
                {model.latestBatch?.status ?? "n/a"}
              </dd>
              <dd className="text-xs leading-5 text-zinc-500">
                {statusCountText(model.batchStatusCounts)}
              </dd>
            </div>
            <div className="border-b border-zinc-200 px-3 py-2 md:border-b-0 md:border-r">
              <dt className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
                Vendite batch
              </dt>
              <dd className="mt-1 text-sm font-semibold text-zinc-950">
                {model.latestBatch
                  ? `${model.latestBatch.saleCount} vendite / ${model.latestBatch.lineCount} righe`
                  : "n/a"}
              </dd>
              <dd className="text-xs leading-5 text-zinc-500">
                {model.latestBatch
                  ? `accepted ${model.latestBatch.acceptedSaleCount}, duplicate ${model.latestBatch.duplicateSaleCount}, conflict ${model.latestBatch.conflictCount}`
                  : "Nessun ack server"}
              </dd>
            </div>
            <div className="px-3 py-2">
              <dt className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
                Da verificare
              </dt>
              <dd className="mt-1 text-sm font-semibold text-zinc-950">
                {model.issueSales.length +
                  model.stockWarnings.length +
                  model.recentFailures.length}
              </dd>
              <dd className="text-xs leading-5 text-zinc-500">
                {hasIssues
                  ? "Sono presenti righe server-side da controllare"
                  : "Nessuna anomalia server-side recente"}
              </dd>
            </div>
          </dl>

          {!hasIssues ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm leading-6 text-emerald-950">
              Nessuna vendita server-side in conflict/failed/needs attention e
              nessuno stock warning recente per questa shop.
            </div>
          ) : null}

          <div className="grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-950">
                Recovery actions sicure
              </h3>
              <p className="mt-1 text-xs leading-5 text-zinc-600">
                Le azioni sotto scrivono solo audit append-only. Non cancellano
                outbox, non modificano vendite, non muovono stock e non forzano
                ack server.
              </p>
            </div>
            <form
              action={recordPosSyncRecoveryActionAction}
              className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,220px)]"
            >
              {selectedShopId ? (
                <input name="shop_id" type="hidden" value={selectedShopId} />
              ) : null}
              <label className="grid gap-1 text-sm font-medium text-zinc-800">
                Target recovery
                <select
                  className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950"
                  name="targetRef"
                  required
                >
                  {actionTargets.map((target) => (
                    <option key={target.value} value={target.value}>
                      {target.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-zinc-800">
                Azione
                <select
                  className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950"
                  name="actionType"
                  required
                >
                  <option value="mark_reviewed">Segna come verificato</option>
                  <option value="add_note">Aggiungi nota interna</option>
                  <option value="request_pos_retry">
                    Richiedi retry POS (audit only)
                  </option>
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-zinc-800 lg:col-span-2">
                Nota interna redatta
                <textarea
                  className="min-h-20 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950"
                  maxLength={600}
                  name="note"
                  placeholder="Contesto operativo per manager/assistenza. Non inserire token, PIN o password."
                />
              </label>
              <div className="flex flex-wrap gap-2 lg:col-span-2">
                <button className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white">
                  Registra recovery action
                </button>
              </div>
            </form>
            <details className="rounded-md border border-zinc-200 bg-white p-3">
              <summary className="cursor-pointer text-sm font-medium text-zinc-800">
                Copia/Esporta contesto tecnico
              </summary>
              <textarea
                className="mt-3 min-h-32 w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-700"
                readOnly
                value={recoveryContextText(model)}
              />
            </details>
          </div>

          <div className="grid gap-4">
            <div className="overflow-x-auto rounded-md border border-zinc-200">
              <table className={recoveryTableClassName}>
                <caption className="sr-only">
                  Vendite POS che richiedono verifica
                </caption>
                <thead className="bg-zinc-50">
                  <tr>
                    <th className={recoveryThClassName}>Vendita</th>
                    <th className={recoveryThClassName}>Stato</th>
                    <th className={recoveryThClassName}>Stock</th>
                    <th className={recoveryThClassName}>Totale</th>
                    <th className={recoveryThClassName}>Device / staff</th>
                    <th className={recoveryThClassName}>Ora</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 bg-white">
                  {model.issueSales.length > 0 ? (
                    model.issueSales.map((sale) => (
                      <tr key={sale.posSaleId}>
                        <td className={recoveryTdClassName}>
                          <div className="font-medium text-zinc-950">
                            {sale.saleNumber ?? shortId(sale.clientSaleId)}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {shortId(sale.clientSaleId)} | {sale.saleKind}
                          </div>
                        </td>
                        <td className={recoveryTdClassName}>{sale.status}</td>
                        <td className={recoveryTdClassName}>
                          {sale.stockStatus} ({sale.stockWarningCount})
                        </td>
                        <td className={recoveryTdClassName}>
                          {formatClp(sale.netAmountClp)}
                        </td>
                        <td className={recoveryTdClassName}>
                          <div>{sale.device}</div>
                          <div className="text-xs text-zinc-500">{sale.staff}</div>
                        </td>
                        <td className={recoveryTdClassName}>
                          {formatTimestamp(sale.occurredAt)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className={recoveryTdClassName} colSpan={6}>
                        Nessuna vendita server-side con stato anomalo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto rounded-md border border-zinc-200">
              <table className={recoveryTableClassName}>
                <caption className="sr-only">Stock warnings POS</caption>
                <thead className="bg-zinc-50">
                  <tr>
                    <th className={recoveryThClassName}>Movimento</th>
                    <th className={recoveryThClassName}>Stato</th>
                    <th className={recoveryThClassName}>Issue</th>
                    <th className={recoveryThClassName}>Quantita</th>
                    <th className={recoveryThClassName}>Stock</th>
                    <th className={recoveryThClassName}>Ora</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 bg-white">
                  {model.stockWarnings.length > 0 ? (
                    model.stockWarnings.map((warning) => (
                      <tr key={warning.movementKey}>
                        <td className={recoveryTdClassName}>
                          <div className="font-medium text-zinc-950">
                            {warning.movementKind}
                          </div>
                          <div className="text-xs text-zinc-500">
                            sale {shortId(warning.posSaleId)}
                          </div>
                        </td>
                        <td className={recoveryTdClassName}>{warning.status}</td>
                        <td className={recoveryTdClassName}>
                          {warning.issueCode ?? "n/a"}
                        </td>
                        <td className={recoveryTdClassName}>
                          {warning.quantityDelta}
                        </td>
                        <td className={recoveryTdClassName}>
                          {warning.stockBefore ?? "n/a"} - {warning.stockAfter ?? "n/a"}
                        </td>
                        <td className={recoveryTdClassName}>
                          {formatTimestamp(warning.createdAt)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className={recoveryTdClassName} colSpan={6}>
                        Nessun unresolved_product, stock_conflict o failed recente.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto rounded-md border border-zinc-200">
              <table className={recoveryTableClassName}>
                <caption className="sr-only">Audit failure POS recenti</caption>
                <thead className="bg-zinc-50">
                  <tr>
                    <th className={recoveryThClassName}>Evento</th>
                    <th className={recoveryThClassName}>Risultato</th>
                    <th className={recoveryThClassName}>Target</th>
                    <th className={recoveryThClassName}>Metadata redatti</th>
                    <th className={recoveryThClassName}>Ora</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 bg-white">
                  {model.recentFailures.length > 0 ? (
                    model.recentFailures.map((event) => (
                      <tr key={event.auditLogId}>
                        <td className={recoveryTdClassName}>{event.eventKey}</td>
                        <td className={recoveryTdClassName}>
                          {event.result} / {event.severity}
                        </td>
                        <td className={recoveryTdClassName}>
                          {event.targetType ?? "n/a"} {shortId(event.targetId)}
                        </td>
                        <td className={recoveryTdClassName}>
                          <code className="text-xs">{event.metadataPreview}</code>
                        </td>
                        <td className={recoveryTdClassName}>
                          {formatTimestamp(event.createdAt)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className={recoveryTdClassName} colSpan={5}>
                        Nessun audit failure POS sales sync recente.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto rounded-md border border-zinc-200">
              <table className={recoveryTableClassName}>
                <caption className="sr-only">
                  Recovery actions POS registrate
                </caption>
                <thead className="bg-zinc-50">
                  <tr>
                    <th className={recoveryThClassName}>Azione</th>
                    <th className={recoveryThClassName}>Target</th>
                    <th className={recoveryThClassName}>Metadata redatti</th>
                    <th className={recoveryThClassName}>Ora</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 bg-white">
                  {model.recoveryActions.length > 0 ? (
                    model.recoveryActions.map((action) => (
                      <tr key={action.auditLogId}>
                        <td className={recoveryTdClassName}>
                          <div className="font-medium text-zinc-950">
                            {action.actionType}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {action.result} / {action.severity}
                          </div>
                        </td>
                        <td className={recoveryTdClassName}>
                          {action.targetType ?? "n/a"} {shortId(action.targetId)}
                        </td>
                        <td className={recoveryTdClassName}>
                          <code className="text-xs">{action.metadataPreview}</code>
                        </td>
                        <td className={recoveryTdClassName}>
                          {formatTimestamp(action.createdAt)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className={recoveryTdClassName} colSpan={4}>
                        Nessuna recovery action registrata per questa shop.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-600">
            <p className="font-semibold text-zinc-700">
              Informazioni non disponibili server-side
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {model.unavailableNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
