# POS Sync Debugging Runbook

Stato: software staging-ready. Il test fisico Windows 7/stampante/scanner/rete reale resta `EXTERNAL_NOT_RUN`.

## Catena Di Correlazione

Quando una vendita Win7POS non si sincronizza, seguire questa catena:

```text
Win7POS status strip
  -> C:\ProgramData\Win7POS\logs\app.log
  -> clientRequestId / syncAttemptId / clientBatchId / clientSaleId
  -> Admin Web POS API X-Request-Id
  -> audit_logs metadata_redacted
  -> pos_sales_sync_batches / pos_sales / ledger / stock movements
  -> Admin Web /shop/sync Recovery Center
```

Gli ID sopra non sono secret. Non condividere mai token dispositivo/sessione, PIN,
password, raw payload, service-role key o dump SQLite completi.
La sola risposta che consegna token POS e il first-login HTTPS riuscito verso
Win7POS; failure response, audit, log, UI e ticket non devono contenerli.

## Observability Matrix

| Evento | ID correlazione | Dove guardare | UI visibile | Azione debug |
| --- | --- | --- | --- | --- |
| first-login success/failure | `clientRequestId`, `requestId` | Win7POS `category=online.bootstrap`, Admin Web audit `pos.auth.first_login.*` | Dialog collegamento online | Verificare shop/staff/status device e codice errore |
| heartbeat success/failure | `clientRequestId`, `requestId` | Win7POS `category=online.heartbeat`, Admin Web audit `pos.session.heartbeat.*` | Status strip online/offline/sessione | Se `denied`, ricollegare POS; se rete, verificare HTTPS |
| catalog pull success/failure | `clientRequestId`, `requestId`, `syncCursor` | Win7POS `category=catalog.pull`, Admin Web audit `pos.catalog.pull.*` | Ultimo catalogo / errore catalogo | Controllare cursor, tombstone, schema catalogo e policy |
| sales sync accepted | `syncAttemptId`, `clientRequestId`, `requestId`, `clientBatchId`, `clientSaleId` | Win7POS `category=sales.sync`, audit `pos.sales.sync.success` | Vendite in coda scendono | Cercare batch/sale in Supabase e verificare ledger/stock |
| duplicate retry | `clientBatchId`, `clientSaleId`, `requestId` | Audit `duplicate`, Win7POS ack duplicate | Nessuna nuova coda | Confermare payload hash identico; stock non deve muoversi due volte |
| conflict 409 | `clientBatchId`, `clientSaleId`, `requestId` | Audit `pos.sales.sync.failure`, Recovery Center | Bloccate/attenzione | Confrontare payload hash e non forzare ack |
| validation_failed | `requestId`, `clientSaleId` | API error body/header, audit failure | Bloccate/attenzione | Correggere payload/schema; non modificare SQLite manualmente |
| denied/session expired | `clientRequestId`, `requestId` | Win7POS online.* / sales.sync denied | Sessione da ricollegare | Ricollegare dispositivo o controllare revoca staff/device |
| not_configured | `requestId` | API error, staging check | Non collegato | Configurare env/server-side Admin Web, non service-role sul POS |
| stock warning/unresolved product | `clientSaleId`, stock movement key | Recovery Center stock warnings | Richiede attenzione | Mappare prodotto/codice; non cancellare sale append-only |
| recovery action | audit event id, target id | `audit_logs`, `/shop/sync` history | Cronologia recovery | Ricordare: azione audit-only, non modifica vendite/stock/outbox |
| offline sale queued | `clientSaleId`, outbox id | Win7POS outbox/log `sales.outbox` / `sales.sync` | Vendite in coda | Verificare che pagamento sia salvato localmente |
| sync started/completed/failed | `syncAttemptId`, `clientBatchId` | Win7POS `category=sales.sync` | Sync in corso / ultimo errore | Usare `serverRequestId` per cercare audit Admin Web |
| restore pre-backup/sync review | backup path redatto, status key | Win7POS restore logs | Restore DB da revisionare | Controllare outbox prima di nuove vendite |

Dati redatti sempre: authorization header, session/device token, trusted token, PIN,
password, credential, raw service-role, full payload fiscale e path locali se non necessari.
Credenziali DB/Supabase usate durante una review devono essere ruotate dopo la
verifica e non devono comparire in log, screenshot, evidence o documenti.

## Errori Comuni

- `validation_failed`: payload non accettato. Controllare schema version,
  importi CLP integer, righe vendita, pagamento e `clientSaleId`.
- `denied`: sessione/device/staff revocato o token scaduto. Ricollegare POS.
- `method_not_allowed`: client usa metodo diverso da POST; controllare versione client.
- `conflict`: stessa idempotency key con payload diverso. Non modificare stock o sale;
  usare Recovery Center per nota e investigazione.
- `duplicate`: retry idempotente riuscito. Non e un errore.
- `not_configured`: runtime Admin Web senza configurazione Supabase server-side.
- `db_failure`: errore lato Supabase/Admin Web. Usare `requestId` e audit redatto.
- `network_error` / `timeout`: rete o DNS/TLS. Il pagamento deve restare salvato
  localmente e l'outbox ritenta.
- `unresolved_product`: vendita accettata con prodotto non mappato online o stock warning.

## Comandi Utili

Admin Web:

```bash
npm run staging:check
npm run test:pos-local-harness
npm run test:pos-staging-harness:dry-run
npm run test:pos-staging-harness
npm run supabase:check
supabase migration list --linked
```

Win7POS:

```powershell
dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Release -p:Platform=x86 -p:PlatformTarget=x86
pwsh -File scripts/check-pos-online-client.ps1
pwsh -File scripts/check-pos-catalog-pull.ps1
pwsh -File scripts/check-pos-sync-status-ux.ps1
pwsh -File scripts/check-public-staging-config.ps1
pwsh -File scripts/check-pos-debug-logging.ps1
```

Public API smoke:

```bash
curl -I https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev
curl -sS -X PUT https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev/api/pos/sales/sync
```

La risposta POS negativa con metodo non supportato deve essere HTTP 405 con JSON
stabile, `Cache-Control: no-store` e `X-Request-Id` presente. Non deve contenere
stack trace o token.

## Cosa Non Fare

- Non cancellare `sales_sync_outbox`.
- Non modificare SQLite manualmente per sbloccare una vendita.
- Non cancellare vendite/ledger/stock append-only online.
- Non usare `truncate`.
- Non fare cleanup per data generica o cross-shop.
- Non condividere token, PIN, password, service-role key o dump completi.
- Non eseguire harness su produzione.

## Evidenza Minima Da Raccogliere

- `requestId` / header `X-Request-Id`.
- `clientRequestId`.
- `syncAttemptId`.
- `clientBatchId` e `clientSaleId` abbreviati.
- timestamp locale e UTC se disponibile.
- `shop_code`.
- versione app Win7POS.
- error code stabile.
- screenshot status strip o `/shop/sync`, se disponibile.
- estratto log redatto di poche righe intorno all'evento.
