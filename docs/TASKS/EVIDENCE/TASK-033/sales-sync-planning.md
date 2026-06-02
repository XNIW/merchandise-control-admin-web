# TASK-033 Sales Sync Planning

## Stato

- Stato planning: `SALES_SYNC_PLANNED_ONLY`
- Foundation runtime: `BLOCKED_WIN7POS_RUNTIME_UNAVAILABLE`
- Migration schema: `NOT_CREATED`
- Endpoint runtime: `NOT_CREATED`
- Dashboard vendite: `NOT_CREATED`

Questo documento e una milestone interna di `TASK-033`, non un task ufficiale separato. Non crea `TASK-024A`, non implementa sales sync e non dichiara readiness.

## Fonti lette

- Win7POS `SaleRepository`: tabella locale `sales`, righe `sale_lines`, `kind`, `related_sale_id`, `voided_by_sale_id`, `voided_at`, `reason`, `total`, `paidCash`, `paidCard`, `change`, `operator_id`, `pdf_printed`.
- Win7POS `Sale`, `SaleLine`, `SaleKind`, `SaleCompleted`.
- Win7POS `PosViewModel`: vendita completata con `CompleteSaleAsync`, refund/void con `CreateRefundAsync`, stampa PDF fiscale opzionale.
- Admin Web `sync_events`: gia esiste per catalog/prices/history, ma non e schema vendite.
- Policy `WIN7POS-SYNC-POLICY`: Win7POS comunica solo con Admin Web POS API.

## Schema candidate

Schema futuro minimo, da implementare solo con migration dedicata dopo review:

- `pos_sales_sync_batches`: batch ricevuti dal POS, con `shop_id`, `shop_device_id`, `staff_id`, `idempotency_key`, `client_batch_id`, timestamp client/server, `status`, `sale_count` e unique `(shop_id, shop_device_id, idempotency_key)`.
- `pos_sales`: header vendita/refund, con `shop_id`, `shop_device_id`, `staff_id`, `batch_id`, `clientSaleId`, `sale_code`, `created_at_pos`, `kind`, relation refund/void, totali minor-unit, operatore, `pdf_printed` e unique `(shop_id, shop_device_id, clientSaleId)`.
- `pos_sale_lines`: righe vendita, con `client_line_id`, prodotto locale/remoto, barcode, nome redatto, quantity, unit price, line total e relation a riga originale per refund.
- `pos_sale_payments`: pagamenti normalizzati per vendita, con `payment_type in ('cash', 'card')` e `amount_minor`.

## Endpoint candidate

- `POST /api/pos/sales/sync`
- Auth: stesso trusted device/session binding gia usato da heartbeat/catalog pull.
- Body minimo: `deviceToken`, `sessionToken`, `posSessionId`, `shopDeviceId`, `idempotencyKey`, `clientBatchId`, `sales[]`.
- Response: `ok`, `batchId`, `acceptedClientSaleIds[]`, `duplicateClientSaleIds[]`, `serverTime`, `nextRetryAfterSeconds` su errori retryable.

## Idempotency

- Ogni batch deve avere `idempotencyKey` stabile generata da Win7POS e persistita nella offline queue locale.
- Ogni vendita deve avere `clientSaleId` stabile: esempio `device-id:local-sale-id` oppure UUID salvato accanto alla vendita locale.
- Semantica: Win7POS puo inviare at-least-once; Admin Web deve garantire exactly-once persistence tramite unique `(shop_id, shop_device_id, idempotency_key)` e `(shop_id, shop_device_id, clientSaleId)`.
- Retry dello stesso batch deve restituire lo stesso risultato logico, non duplicare righe.
- Errori 5xx/rete sono retryable; errori validazione/auth non devono cancellare la queue.

## Offline strategy

- Win7POS mantiene una offline queue locale separata dalle tabelle `sales`/`sale_lines`.
- Una vendita locale completata entra in queue con stato `pending`.
- Stati minimi: `pending`, `sending`, `acked`, `failed_retryable`, `failed_blocked`.
- La queue non deve bloccare vendita locale offline.
- Il sync parte dopo heartbeat valido o a intervalli/backoff.
- Su restart, ogni item `sending` torna `pending`.
- Non inviare PIN/password, token in log, receipt full text o dati cliente non necessari.

## Test strategy

- Admin Web foundation test per endpoint server-only, Content-Type JSON, body limit, `Cache-Control: no-store`, trusted binding, idempotency batch, idempotency vendita singola, refund/void relation e cleanup dataset sintetico.
- Migration test per RLS/grants senza accesso anon, unique constraints e assenza service-role in client/browser.
- Win7POS test/scanner per queue locale senza token/PIN/password, retry/backoff, `clientSaleId` persistente, mapping operator/staff e nessun Supabase diretto.
- Live gate: richiede Win7POS net48 WPF eseguibile in ambiente Windows o runner compatibile; su questa macchina `dotnet build -p:Platform=x86` passa, ma l'esecuzione live WPF resta `BLOCKED_WIN7POS_RUNTIME_UNAVAILABLE`.

## Decisione TASK-033

- Planning: `SALES_SYNC_PLANNED_ONLY`.
- Foundation: non implementata.
- Motivo blocco: il gate Win7POS live reale non e eseguibile su questa macchina e la dashboard vendite richiederebbe dati sales sintetici reali da endpoint verificato.
- Prossimo passo sicuro: eseguire Win7POS live su Windows/runner compatibile; solo dopo aprire migration/endpoint in una fase reviewata.
