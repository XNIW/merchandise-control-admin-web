# TASK-081 Integration Contract - Admin Web <-> Win7POS

Versione: `2026-06-22-contract-v1`

Questo file è il contratto operativo unico per TASK-081. Le patch Admin Web,
Supabase e Win7POS devono restare coerenti con questo documento. Se un campo o
una policy cambia, aggiornare prima questo file, poi codice, test ed evidence.

## Source Of Truth

| Dominio | Source of truth | Regola |
|---|---|---|
| Dati ufficiali shop | Admin Web/Supabase | Modificabili solo da Master Console con `platform_admin`; Shop Admin e Win7POS sono read-only. |
| Catalogo prodotti/categorie/fornitori/prezzi | Admin Web/Supabase | Win7POS conserva snapshot SQLite per offline; pull bounded/delta quando disponibile. |
| Vendite POS prima del sync | Win7POS SQLite | Commit locale immediato e append-only; outbox persistente per push. |
| Vendite POS dopo sync accepted | Supabase `pos_sales` + ledger | Duplicate con stesso payload sono no-op; conflitto idempotenza blocca. |
| Incassi | `pos_revenue_ledger_entries` server-side | Vista principale completa gestionale; vista secondaria documentata/fiscale; differenza visibile. |
| Stock | Snapshot locale Win7POS + `inventory_products.stock_quantity` server | Decremento locale a vendita completata; decremento server a sync accepted; movimenti idempotenti. |

## Endpoint Admin Web Usati Da Win7POS

| Direzione | Endpoint | Metodo | Stato TASK-081 | Uso |
|---|---|---:|---|---|
| Win7POS -> Admin Web | `/api/pos/auth/first-login` | POST | Esistente | Bootstrap device/staff/shop/session e token DPAPI lato POS. |
| Win7POS -> Admin Web | `/api/pos/session/heartbeat` | POST | Esistente | Stato device/session, revoche, policy refresh. |
| Win7POS -> Admin Web | `/api/pos/catalog/pull` | POST | Esistente | Pull prodotti/prezzi/barcode/stock snapshot e dati shop disponibili. |
| Win7POS -> Admin Web | `/api/pos/sales/sync` | POST | Esteso TASK-081 | Batch vendite, righe, pagamenti, fiscal status, ledger e stock movements. |

Win7POS non usa Supabase diretto e non riceve mai service-role key. Tutti gli
endpoint POS sono server-side, autenticati con device token + session token.

## Payload `pos-sales-ledger-v2`

Esempio canonico:

```json
{
  "schemaVersion": "pos-sales-ledger-v2",
  "appVersion": "0.1.0.0",
  "shopCode": "SHOP001",
  "shopDeviceId": "uuid",
  "posSessionId": "uuid",
  "deviceToken": "***",
  "sessionToken": "***",
  "batch": {
    "clientBatchId": "win7pos-20260622-000001",
    "idempotencyKey": "win7pos-20260622-000001"
  },
  "sales": [
    {
      "clientSaleId": "sale-123",
      "idempotencyKey": "sale-123-v1",
      "saleNumber": "V-20260622-001",
      "kind": "sale",
      "occurredAt": "2026-06-22T21:45:00-04:00",
      "businessDate": "2026-06-22",
      "currency": "CLP",
      "amounts": {
        "grossClp": 9000,
        "discountClp": 0,
        "taxClp": 0,
        "netClp": 9000,
        "paidClp": 10000,
        "changeClp": 1000
      },
      "lines": [
        {
          "clientLineId": "line-1",
          "linePosition": 1,
          "lineType": "item",
          "productId": "remote-product-uuid-or-null",
          "localProductId": "123",
          "barcode": "7800000000000",
          "itemNumber": "SKU-1",
          "productName": "Producto",
          "quantity": 1,
          "unitAmountClp": 9000,
          "amountClp": 9000,
          "stockQuantityDelta": -1
        }
      ],
      "payments": [
        {
          "clientPaymentId": "cash-1",
          "method": "cash",
          "amountClp": 10000,
          "changeClp": 1000
        }
      ],
      "fiscal": {
        "status": "printed_local_pdf",
        "documentType": "boleta",
        "documentNumber": "redacted-or-local-number",
        "printedAt": "2026-06-22T21:45:10-04:00"
      }
    }
  ]
}
```

### Campi Monetari

- `currency` in v2 è sempre `CLP`.
- Importi `*_Clp` sono interi safe, niente float.
- `netClp` è signed: sale positivo, refund/void negativo.
- `payment.amountClp` è signed e include il contante ricevuto; `changeClp`
  resta separato e positivo.
- `payment.amountClp - changeClp` deve coincidere con `netClp`.

### Tipi Vendita

| `kind` | Ledger | Stock |
|---|---|---|
| `sale` | `item`, `discount`, `tax`, `payment`, `change` | decremento righe item. |
| `refund` | `refund_item`, `refund_payment` | incremento/reversal. |
| `void` | `refund_item`, `refund_payment`, `void_marker` | movimento inverso idempotente. |

Refund/void/correzioni sono append-only. Non cancellare fisicamente la vendita
originale.

## Response Contract

Success:

```json
{
  "ok": true,
  "code": "success",
  "serverTime": "2026-06-22T21:45:12.000Z",
  "shop": { "shopId": "uuid", "shopCode": "SHOP001" },
  "batch": {
    "clientBatchId": "win7pos-20260622-000001",
    "posSalesSyncBatchId": "uuid",
    "saleCount": 1,
    "acceptedSaleCount": 1,
    "duplicateSaleCount": 0,
    "conflictCount": 0,
    "lineCount": 1,
    "status": "accepted"
  },
  "sales": [
    { "clientSaleId": "sale-123", "posSaleId": "uuid", "status": "accepted" }
  ]
}
```

Duplicate batch/sale con stesso payload hash:

- HTTP 200;
- `code: "success"` e sale ack con `status: "duplicate"`;
- nessun nuovo decremento stock;
- Win7POS può marcare outbox `acked`.

Errori:

| HTTP | `code` | Azione Win7POS |
|---:|---|---|
| 400 | `validation_failed` | `failed_blocked`, richiede intervento/supporto. |
| 401 | `denied` | cancella trust locale, mantiene vendita in outbox e riprova dopo nuovo login/sessione. |
| 409 | `conflict` | `failed_blocked`, quarantena batch/sale. |
| 500 | `db_failure` | retry con backoff. |
| 503 | `not_configured` | retry con backoff. |

Le response non includono token, PIN, payload raw o dati fiscali non redatti.

## Idempotenza

- Batch unique: `(shop_id, shop_device_id, client_batch_id)` e
  `(shop_id, shop_device_id, idempotency_key)`.
- Sale unique: `(shop_id, shop_device_id, client_sale_id)` e
  `(shop_id, shop_device_id, idempotency_key)`.
- Conflict: stessa chiave ma payload hash diverso.
- Stock movement key:
  `shop_id:shop_device_id:client_sale_id:client_line_id:movement_kind`.
- Duplicate retry non deve creare nuove righe ledger né doppio decremento stock.

## Mapping Win7POS SQLite -> Admin Web

| Win7POS locale | Payload v2 | Supabase |
|---|---|---|
| `sales.id` | `clientSaleId` stabile | `pos_sales.client_sale_id` |
| `sales.code` | `saleNumber` | `pos_sales.sale_number` |
| `sales.createdAt` | `occurredAt`, `businessDate` | `pos_sales.occurred_at`, `business_date` |
| `sales.kind` | `kind` | `pos_sales.business_kind` |
| `sales.related_sale_id` | `clientOriginalSaleId` se disponibile | `pos_sales.client_original_sale_id` |
| `sales.total` | `amounts.netClp` signed | `pos_sales.net_amount_clp`, ledger |
| `sales.paidCash` | payment `cash` | ledger `payment/cash` |
| `sales.paidCard` | payment `card` | ledger `payment/card` |
| `sales.change` | `changeClp` | ledger `change` |
| `sale_lines.*` | `lines[]` | `pos_sale_lines`, ledger item/refund_item |
| `sale_lines.productId` | `localProductId` | snapshot only |
| `products.remote_product_id` | `productId` | FK when valid UUID/scope |
| `sales.pdf_printed` | fiscal status | `pos_sales.fiscal_status` |

Win7POS deve aggiungere outbox persistente: `client_sale_id`,
`client_batch_id`, `idempotency_key`, `payload_json`, `payload_hash`, `status`,
`attempt_count`, `next_retry_at`, `server_batch_id`, `server_sale_id`,
`last_error_code`, timestamps.

## Mapping Admin Web -> Win7POS

| Admin Web | Win7POS locale |
|---|---|
| shop ufficiale (`shops`) | visualizzazione read-only, receipt info da sync/pull |
| staff POS (`staff_accounts`) | utenti/PIN remoti via bootstrap/sessione |
| device/session (`shop_devices`, `pos_sessions`) | DPAPI trusted device/session store |
| prodotti/prezzi/barcode/stock | `products`, `product_meta`, snapshot offline |
| categorie/fornitori | snapshot se disponibile; non blocca vendite |
| revoche/policy | heartbeat e login refresh |

Win7POS non può inviare update shop ufficiale. Eventuali impostazioni locali
negozio preesistenti diventano read-only o override non persistente.

## Stock Movement Policy

- Nessun decremento su carrello.
- Decremento locale Win7POS solo dopo pagamento/vendita completata.
- Decremento server in `/api/pos/sales/sync` quando batch accepted.
- `productId` mancante o non risolto: warning visibile, vendita accepted se il
  payload è valido.
- Stock insufficiente: movement `stock_conflict`, nessun doppio decremento,
  warning in Admin Web.
- Refund/void: movimento inverso append-only.

## Revenue Ledger Policy

- `pos_revenue_ledger_entries` è la fonte per incassi.
- `pos_sales` resta header/idempotenza/compatibilità.
- Vista completa gestionale: include tutte le vendite reali.
- Vista documentata/fiscale: filtro su `printed_local_pdf`,
  `issued_external`, `accepted_authority`, `not_required`.
- Vendite non documentate / da verificare: differenza tra completo e
  documentato, sempre visibile a utenti autorizzati.

## Fiscal / Documented Revenue Policy

- `printed_local_pdf` indica documento/stampa locale, non accettazione SII.
- `issued_external`/`accepted_authority` sono riservati a integrazione fiscale
  verificata.
- `not_printed_card_policy` e `not_reported` restano visibili nella differenza.
- Non usare termini che nascondono o falsificano l'incasso completo.

## Offline / Retry Policy

- Win7POS vende offline e committa localmente.
- Outbox persistente conserva payload e hash.
- Online: push immediato dopo vendita completata.
- Offline/retry: batch piccoli, ordine stabile, backoff, max attempt prima di
  `failed_blocked`.
- All'avvio: eventuali `sending` tornano retryable.
- Revoca device/staff/session: server risponde `denied`; vendita resta locale
  in quarantena, non cancellata.

## Realtime / Polling Policy

- Win7POS push immediato se online.
- Admin Web aggiorna Supabase nel write path.
- `/shop/pos` usa polling bounded ogni 5-15 secondi solo nella pagina incassi.
- UI mostra `Aggiornato alle`, stato `live/stale/offline`.
- Niente polling globale, refresh pagina completa o query full scan.

## Read-Only Shop Data Policy

- Master Console/platform_admin è l'unico writer per dati ufficiali shop.
- Shop Admin visualizza dati ufficiali, senza save/edit.
- `updateShopSettings` deve rispondere
  `SHOP_SETTINGS_MANAGED_BY_MASTER_CONSOLE`.
- Win7POS visualizza dati shop da sync/pull; dialog impostazioni shop deve
  essere read-only e senza comando save.

## Anti-Mismatch Check

Per ogni campo UI incassi:

| UI field | Read model | DB/view | Sync write | Win7POS payload |
|---|---|---|---|---|
| Incasso completo | `today.netRevenueClp` | `pos_revenue_daily_summary_v.net_revenue_clp` | ledger rows | `amounts`, `lines`, `payments` |
| Incasso documentato | `today.documentedRevenueClp` | view fiscal filter | `pos_sales.fiscal_status` | `fiscal.status` |
| Da verificare | `today.verificationRevenueClp` | view difference | ledger + fiscal status | fiscal status |
| Cash/Card/Transfer/Other | `today.*Clp` | ledger payment rows | `payments[]` | `sales.paidCash/paidCard/...` |
| Refund/Void | `refundCount`, `voidCount` | view by `business_kind` | `pos_sales.business_kind` | `kind` |
| Warning stock | `stockWarningCount`, warnings | `pos_sale_stock_movements` | RPC movement | line `productId`, `stockQuantityDelta` |
| Ultimo sync | `realtime.lastSyncAt` | batch/device/ledger timestamps | batch insert | outbox ack |

## Test Matrix Obbligatoria

La matrice dettagliata è in `TEST-MATRIX.md` e deve essere aggiornata dopo ogni
gate. Nessun claim finale può essere dichiarato completo senza evidence reale o
`NOT_RUN` motivato.
