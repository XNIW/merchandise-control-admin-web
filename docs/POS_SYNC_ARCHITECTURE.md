# POS Sync Architecture

Stato: staging-ready software path. Production richiede ancora smoke su Windows 7 reale, stampante/scanner e rete instabile reale.

## Flusso

```text
Win7POS WPF
  SQLite locale
  sales_sync_outbox
  DPAPI device/session tokens
        |
        | HTTPS Admin Web POS API
        v
Admin Web Next.js server
  /api/pos/auth/first-login
  /api/pos/session/heartbeat
  /api/pos/catalog/pull
  /api/pos/sales/sync
        |
        | server-only Supabase admin client
        v
Supabase
  shops, staff_accounts, shop_devices
  pos_sessions, pos_device_credentials
  inventory_*, pos_sales_sync_batches
  pos_sales, pos_sale_lines, pos_sale_payments
  pos_revenue_ledger_entries, pos_sale_stock_movements
  audit_logs
        |
        v
Shop Admin Recovery Center
  /shop/sync POS Sync Recovery + append-only recovery actions
```

Win7POS non parla mai direttamente con Supabase. La service-role key resta solo nel runtime server-side Admin Web.

## Cross-platform Data Contract

Android/iOS restano il riferimento di contratto dati per l'ecosistema mobile,
ma Win7POS non copia il loro runtime: usa un flusso legacy offline-first con
SQLite locale, outbox persistente e solo Admin Web POS API.

| Superficie | Ruolo | Dati/contratto | Runtime | Stato |
| --- | --- | --- | --- | --- |
| Admin Web / Supabase | Source of truth e server boundary | `shops` come root business, `shop_id` / `shop_code`, catalogo, stock, sync events, sales ledger, audit | Next.js server-only verso Supabase admin client | Staging online verificato |
| Win7POS | Offline-first POS legacy | mirror SQLite, `sales_sync_outbox`, catalog-v2, `pos-sales-ledger-v2`, token DPAPI | .NET Framework 4.8 x86, HTTPS Admin Web POS API | Software verificato; hardware reale esterno |
| Android/iOS | Riferimento contratto dati mobile | shop/product/category/supplier, stock/history, sync status, conflict, offline pending | Client mobile moderno; non modificato in questa task | Contratto usato come riferimento, non come runtime Win7POS |

Invariante comune: i dati business appartengono sempre a `shop_id` /
`shop_code`; product/category/supplier, stock/history/ledger, sync status,
conflict e offline pending mantengono significato coerente tra piattaforme.
Le differenze sono runtime e storage locale, non semantica business.

## Source Of Truth

- Online: Supabase e Admin Web sono source of truth per shop, staff POS, device, catalogo, stock online, sales ledger e audit.
- Locale: Win7POS mantiene mirror SQLite per lavorare offline dopo il primo bootstrap online.
- Vendite offline: la vendita viene salvata prima localmente, con outbox e idempotency key stabili. Il server conferma solo quando riceve e accetta il batch.
- Dati append-only: sales/ledger/stock movement online non vengono cancellati dal harness; i test restano marcati `TASK032`.

## Regole Offline-First

- Primo avvio: richiede online first-login con `shop_code`, `staff_code` e PIN/password.
- Avvio offline dopo bootstrap: usa mirror locale e token/sessione salvati con DPAPI.
- Vendita offline: non dipende dalla rete; aggiorna stock locale e accoda `sales_sync_outbox`.
- Ritorno online: Win7POS invia batch in ordine stabile, con retry/backoff e ack idempotente.
- Revoca mentre offline: non e immediata sul POS offline; viene applicata al prossimo heartbeat/catalog pull/sales sync online.
- Restore DB: Win7POS crea pre-backup, esegue integrity check e marca lo stato sync come da revisionare.

## Contratti E Versioni

Le versioni sono centralizzate in `src/server/pos-auth/pos-contract.ts` e replicate lato Win7POS in `Win7POS.Core.Online.PosOnlineContract`.

| Contratto | Versione |
| --- | --- |
| Policy POS | `pos-policy-v1` |
| Catalog pull | `2` / capability `catalog-v2` |
| Sales sync legacy | `pos-sales-v1` |
| Sales sync ledger | `pos-sales-ledger-v2` |
| Payment supported | `cash`, `card`, `other` |
| Payment unsupported | `transfer` |

- First login: input shop/staff/device/credential; output shop, staff, trusted device token, session token, policy `pos-policy-v1`, `serverTime`.
- Heartbeat: input trusted device/session; output session aggiornata e `serverTime`.
- Catalog pull: schema version `2`; output catalogo shop-scoped, tombstones, `syncCursor`, `serverTime`, policy.
- Sales sync: schema `pos-sales-ledger-v2`; input batch/sales/lines/payments/fiscal redatto; output batch ack, sale ack, duplicate ack, `serverTime`.
- Policy: `offlinePolicy`, `staffPolicy`, `paymentPolicy`, `taxPolicy`, `capabilities`, `limitations`.

Campi non supportati sono dichiarati come limited/unsupported. Win7POS deve ignorare campi additivi non conosciuti e non deve abilitare feature non dichiarate.

## Idempotenza

- Batch: `clientBatchId`, `idempotencyKey`, `payloadHash`.
- Sale: `clientSaleId`, `idempotencyKey`, `payloadHash`.
- Stesso key + stesso payload: duplicate safe, ack positivo.
- Stesso key + payload diverso: conflict 409.
- Stock: `pos_apply_sale_stock_movement` usa movement key stabile; duplicate retry non decrementa due volte.

## Stock

- Win7POS aggiorna stock locale nel path vendita.
- Admin Web/Supabase applica movement online durante sales sync.
- `unresolved_product`, `stock_conflict` e `failed` restano visibili nel Recovery Center.
- Vendite con local product id senza product id online non devono sparire: vengono tracciate come warning/needs review secondo il modello disponibile.

## Recovery

- Win7POS mostra pending/retry/blocked, vendite bloccate e stato restore needs review.
- Admin Web `/shop/sync` mostra ultimo batch, status counts, issue sales, stock warnings, audit failures redatti e cronologia recovery.
- Recovery Actions MVP:
  - `mark_reviewed`;
  - `add_note`;
  - `request_pos_retry` solo come richiesta/audit, senza polling POS o retry forzato.
- Le azioni recovery scrivono solo `audit_logs` append-only con `event_key` `pos.sync.recovery.*`, `shop_id`, target validato nello shop e metadata redatti.
- Il manager puo lasciare traccia operativa e copiare/esportare contesto tecnico redatto.
- Recovery Actions NON cancellano outbox, non modificano vendite, non muovono stock, non forzano ack e non risolvono automaticamente conflict.

## Sicurezza

- `SUPABASE_SERVICE_ROLE_KEY` solo server-side.
- POS API usa JSON, body limit, `Cache-Control: no-store`, route node runtime e error contract stabile.
- Ogni POS API importante genera `X-Request-Id` e accetta un `X-Client-Request-Id`
  non sensibile per correlare Win7POS log, Admin Web audit e Recovery Center.
- Win7POS salva token device/session con DPAPI.
- PIN/password non vengono loggati o sincronizzati raw.
- Audit/log devono usare metadata redatti e non includere token o payload sensibili.
- I token POS sono presenti solo nella response HTTPS di first-login riuscita
  necessaria al bootstrap dispositivo; non devono comparire in failure response,
  audit, log, docs o UI.
- Business data sempre shop-scoped con `shop_id` / `shop_code`.

## Debugging E Observability

Runbook operativo: `docs/POS_SYNC_DEBUGGING_RUNBOOK.md`.

Catena attesa:

```text
Win7POS status strip -> app.log -> clientRequestId/syncAttemptId/clientBatchId/clientSaleId
-> Admin Web X-Request-Id -> audit_logs metadata_redacted
-> pos_sales_sync_batches / pos_sales / ledger / stock movements -> /shop/sync
```

Log e audit devono distinguere almeno rete/auth/schema/payload/Supabase/stock/conflict
senza esporre authorization header, token POS, PIN/password, service-role key o raw payload.

## Harness

Readiness staging one-command:

```bash
npm run staging:check
```

Negative harness:

```bash
npm run build
npm run start -- --hostname 127.0.0.1 --port 3005
npm run test:pos-local-harness
```

Positive locale:

```bash
TASK032_POS_E2E_ENABLE_POSITIVE=yes \
TASK032_POS_E2E_ALLOW_DATASET_SETUP=yes \
TASK032_POS_E2E_ALLOW_CLEANUP=yes \
TASK032_POS_E2E_TEST_RUN_ID=LOCAL01 \
SUPABASE_SERVICE_ROLE_KEY=<local-service-role-only-in-test-shell> \
npm run test:pos-local-harness
```

Staging dry-run:

```bash
TASK032_POS_E2E_STAGING_PROJECT_REF=<expected-ref> \
TASK032_POS_E2E_STAGING_HOST_ALLOWLIST=<staging-host> \
TASK032_POS_E2E_BASE_URL=https://<staging-host> \
TASK032_POS_E2E_TEST_RUN_ID=STAGE01 \
NEXT_PUBLIC_SUPABASE_URL=https://<expected-ref>.supabase.co \
npm run test:pos-staging-harness:dry-run
```

Equivalente esplicito:

```bash
TASK032_POS_E2E_STAGING_DRY_RUN=yes \
TASK032_POS_E2E_ENABLE_POSITIVE=yes \
TASK032_POS_E2E_ALLOW_DATASET_SETUP=yes \
TASK032_POS_E2E_ALLOW_CLEANUP=yes \
TASK032_POS_E2E_ALLOW_STAGING=yes \
TASK032_POS_E2E_STAGING_PROJECT_REF=<expected-ref> \
TASK032_POS_E2E_STAGING_HOST_ALLOWLIST=<staging-host> \
TASK032_POS_E2E_BASE_URL=https://<staging-host> \
TASK032_POS_E2E_TEST_RUN_ID=STAGE01 \
TASK032_POS_E2E_REQUIRE_TEST_MARKER=TASK032 \
NEXT_PUBLIC_SUPABASE_URL=https://<expected-ref>.supabase.co \
npm run test:pos-local-harness
```

Staging reale richiede gli stessi guardrail, service-role solo nel processo test, cleanup abilitato, host allowlisted, project ref corrispondente e marker `TASK032`. Produzione viene bloccata.

Stato online verificato 2026-06-28:

- Admin Web pubblico HTTPS: `https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev`.
- Cloudflare Workers staging version ID: `9e58a836-5ff6-4ead-aef3-464435418451`.
- Supabase remoto: project ref redatto `jpgo...kyvm`.
- Migration remota TASK-081 applicata con `supabase db push --linked` prima del run positivo.
- Positive harness remoto: `PASS_STAGING_POS_E2E_WITH_CLEANUP`.
- Positive harness locale: `PASS_LOCAL_POS_E2E_WITH_CLEANUP`.
- Verifica cleanup post-run online: zero shop/staff/device/session/credential/mapping/product/category/supplier TASK032 attivi; restano solo righe append-only sales/batches/ledger/stock marcate TASK032 e shop-scoped.
- Custom domain staging: `READY_TO_CONFIGURE`; workers.dev resta il fallback pubblico verificato finche manca un dominio autorizzato.
- Warning Excel/OpenNext ridotti: `read-excel-file@^9.2.0`,
  `write-excel-file@^4.1.1` e `unzipper-esm@^0.13.2` rimuovono la catena
  `bluebird` e i warning copy zip da `cf:build`.

Comando staging reale:

```bash
TASK032_POS_E2E_STAGING_PROJECT_REF=<expected-ref> \
TASK032_POS_E2E_STAGING_HOST_ALLOWLIST=<staging-host> \
TASK032_POS_E2E_BASE_URL=https://<staging-host> \
TASK032_POS_E2E_TEST_RUN_ID=STAGE01 \
NEXT_PUBLIC_SUPABASE_URL=https://<expected-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-only-in-test-shell> \
npm run test:pos-staging-harness
```

Cleanup:

- mai truncate;
- mai cleanup per data generica;
- solo `TASK032_*`;
- staging usa prefix run-scoped e shop id dopo lookup;
- sales/ledger/stock append-only restano marcate.

## Limiti Rimasti

- `P1 esterno`: Windows 7 reale, stampante/scanner e rete instabile reale sono `EXTERNAL_NOT_RUN`.
- Production richiede ancora smoke hardware Win7 reale; lo staging software online e stato verificato con dataset sintetico TASK032.
- Recovery mutante resta volutamente non implementata: non esiste force sync, stock repair o clear error server-side.
- Production-ready hardware gate non e chiuso da questo repository.
