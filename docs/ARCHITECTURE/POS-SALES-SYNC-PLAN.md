# POS Sales Sync Plan

## Stato e decisione

Questo documento e planning-only per TASK-034. Non introduce migration, endpoint, dashboard vendite live o runtime sales sync.

Decisione: sales sync resta `PLANNING_ONLY` finche Win7POS live E2E, o ambiente equivalente Windows/WPF, non passa con first-login, trusted device, sessione, catalog pull, log redatti e cleanup dataset sintetico.

## Prerequisiti prima di implementare

- Win7POS live E2E su runtime Windows/WPF compatibile.
- Endpoint HTTPS non-production affidabile, non Vercel Production.
- Dataset sintetico shop/staff/device/catalogo con cleanup verificato.
- Conferma che Win7POS non parla direttamente con Supabase.
- Contratto idempotency approvato.
- Policy device/session/staff binding approvata.
- Test matrix approvata.
- Stop condition approvata per rollback senza perdita dati.

## Schema candidate non esecutivo

Tabelle candidate, solo proposta:

- `pos_sales`: header vendita shop-scoped con `shop_id`, `device_id`, `staff_account_id`, `pos_session_id`, `client_sale_id`, `idempotency_key`, `sale_number`, `business_date`, `status`, `voided_at`, `refunded_at`, totali e audit metadata.
- `pos_sale_lines`: righe prodotto con `product_id`, SKU/barcode snapshot, quantita, prezzo unitario, sconti, imposte future, totale riga e tombstone/snapshot per catalogo cambiato.
- `pos_sale_payments`: pagamenti con tipo cash/card/other, importo, valuta, riferimento esterno opzionale redatto.
- `pos_sales_sync_batches`: batch ricevuti dal POS con `batch_id`, conteggi, stato, retry metadata e checksum opzionale.
- `pos_sales_conflicts`: conflitti o payload respinti con codici redatti e riferimenti audit.

Nessuna di queste tabelle viene creata in TASK-034.

## Endpoint candidate non esecutivi

- `POST /api/pos/sales/sync`: riceve batch vendite offline/online.
- `GET /api/pos/sales/sync/status?batchId=...`: opzionale per recovery batch.
- `POST /api/pos/sales/void`: opzionale, solo se void/refund non viene modellato nel batch sync.

Nessun endpoint viene creato in TASK-034.

## DTO candidate

Payload batch candidato:

```json
{
  "batchId": "client-generated-batch-id",
  "deviceId": "trusted-device-id",
  "sessionId": "pos-session-id",
  "staffCode": "staff-code-snapshot",
  "sales": [
    {
      "clientSaleId": "stable-local-sale-id",
      "idempotencyKey": "shop-device-client-sale-version",
      "occurredAt": "ISO-8601",
      "businessDate": "YYYY-MM-DD",
      "status": "completed",
      "lines": [],
      "payments": []
    }
  ]
}
```

Response candidato:

```json
{
  "batchId": "client-generated-batch-id",
  "accepted": [],
  "duplicates": [],
  "conflicts": [],
  "rejected": [],
  "serverTime": "ISO-8601"
}
```

## Idempotency key

- Ogni vendita deve avere `clientSaleId` stabile generato dal POS locale.
- Ogni submit deve includere `idempotency key` deterministica, per esempio `shopId:deviceId:clientSaleId:version`.
- Il server deve garantire persistenza exactly-once per la vendita logica anche con delivery at-least-once.
- Retry dello stesso payload deve restituire duplicate/accepted coerente, non creare righe doppie.
- Cambiamento payload con stessa key deve diventare conflict handling, non overwrite silenzioso.

## Offline queue e retry

- Win7POS mantiene offline queue locale ordinata.
- Retry con backoff incrementale e jitter leggero.
- Batch piccoli e bounded per evitare payload troppo grandi.
- Nessun token/PIN/password raw in coda.
- Log solo con ID redatti o hash non reversibili.
- Recovery dopo crash: riprende da record pending/failed, non da memoria volatile.

## Conflict handling

Conflitti candidate:

- stessa idempotency key con payload diverso;
- device revocato dopo vendite offline;
- staff sospeso dopo vendite offline;
- shop sospeso;
- sessione scaduta;
- prodotto archiviato dopo vendita offline;
- differenza totali righe/pagamenti.

Policy proposta:

- Vendite completate prima della revoca possono essere messe in `needs_review` se device/session binding e timestamp sono credibili.
- Vendite dopo revoca/sospensione devono essere respinte o quarantine secondo policy approvata.
- Totali incoerenti devono essere respinti con codice redatto.

## Void/refund

- `void` prima della chiusura giornata: status separato, riferimento alla vendita originale.
- `refund` dopo completamento: record dedicato o vendita negativa collegata, da decidere prima della migration.
- Ogni void/refund richiede audit reason e staff binding.
- Niente cancellazione fisica come recovery ordinaria.

## Payment totals cash/card

- Ogni vendita deve dichiarare payment totals cash/card/other.
- Somma pagamenti deve combaciare con totale vendita entro regole valuta/arrotondamento.
- Card reference esterno deve essere opzionale e redatto.
- Nessun PAN, CVV o dato carta sensibile.

## Sicurezza e privacy

- Admin Web POS API resta server-side e shop-scoped.
- Service role solo server-side, mai client/browser/Win7POS.
- Autorizzazione basata su trusted device token, session token, staff binding e shop status.
- PIN/password non viaggiano nel sales sync.
- Log tecnici redatti.
- DTO non includono credential hash.
- Dati reali non usati nei test.
- Keyword policy: device revocation e shop suspension sono gate server-side, non stati fidati dal client.

## Device/session/staff/shop binding

- Ogni batch deve essere associato a shop, device trusted, sessione POS e staff.
- Device revocation blocca nuove sync o manda in quarantine secondo policy.
- Shop suspension blocca nuove vendite e sync, salvo eventuale drain offline approvato.
- Staff suspension o role change richiede policy temporale basata su `occurredAt` e server receive time.

## Audit

Audit minimo:

- batch ricevuto;
- vendita accettata;
- duplicate idempotente;
- conflict;
- rejection;
- void/refund;
- device revoked during sync;
- shop suspended during sync.

Audit reason obbligatoria per void/refund e override manuali futuri.

## Dashboard vendite futura

Dashboard futura solo dopo runtime verificato:

- riepilogo vendite per shop e business date;
- totali cash/card;
- conflitti sync;
- vendite in review;
- device/staff/session drilldown;
- export solo dopo policy privacy.

Non creare dashboard vendite fake o metriche inventate.

## Cleanup dataset test

Ogni E2E sales futuro deve:

- creare shop/staff/device/prodotti sintetici con prefisso task;
- inviare vendite sintetiche;
- verificare accepted/duplicate/conflict;
- archiviare o rimuovere dati sintetici secondo schema;
- verificare zero residui attivi;
- non toccare dati reali.

## Test matrix

Keyword: test matrix.

- First sync online con vendita singola.
- Retry stesso payload con stessa idempotency key.
- Retry stessa key con payload diverso.
- Offline queue multi-vendita.
- Crash/restart POS prima del retry.
- Device revocato.
- Sessione scaduta.
- Staff sospeso.
- Shop sospeso.
- Prodotto archiviato dopo vendita offline.
- Void.
- Refund.
- Totali cash/card coerenti.
- Totali incoerenti.
- Payload troppo grande.
- JSON invalido/content-type errato/no-store.

## Roll-out plan

Keyword: roll-out plan.

1. Confermare Win7POS live E2E non-sales.
2. Approvare schema e policy conflict.
3. Aprire task migration/API separato.
4. Implementare endpoint con test idempotency e security.
5. Implementare client Win7POS con offline queue in task separato.
6. Eseguire E2E non-production con dati sintetici e cleanup.
7. Solo dopo, dashboard vendite read-only.

## Stop condition

Keyword: stop condition.

- Fermare se manca Win7POS live E2E o ambiente equivalente.
- Fermare se Vercel/hosting disponibile e solo Production.
- Fermare se idempotency non e dimostrabile con test.
- Fermare se device/session/staff binding non e enforceable server-side.
- Fermare se i log espongono token, PIN, password o payload sensibili.
- Fermare se cleanup dataset sintetico non e verificabile.
