# TASK-147 - Admin staging Worker CPU remediation

## Informazioni generali

- ID: `TASK-147`
- Stato: `DONE`
- Fase attuale: `DONE / USER_CONFIRMED_CLOSURE`
- Responsabile attuale: `USER / CONFIRMED CLOSURE`
- Risoluzione finale: `USER_CONFIRMED_CLOSURE`
- Data apertura: `2026-07-29`
- Branch implementative:
  - `codex/admin-staging-worker-cpu-remediation-20260729`;
  - `codex/admin-staging-worker-cpu-remediation-followup-20260729`;
  - `codex/admin-staging-worker-redirect-compatibility-20260729`.
- Branch closeout: `codex/task-147-closeout-20260729`
- Baseline Admin:
  `293b067f54723ef8e9811a078f9f9f40ae34d33b`
- Baseline Win7POS read-only:
  `e47981f6dccbee86150b01f526e0ec6bf484afcc`
- Main runtime finale:
  `9fb54f50999b8587bc37f5e2040743df20df8f08`
- Evidence: `docs/TASKS/EVIDENCE/TASK-147/README.md`
- Handoff:
  `docs/HANDOFFS/WIN7POS_FINAL_ARTICLE_SYNC_CPU_REMEDIATION_READY.md`

## Obiettivo

Eliminare gli `exceededCpu` del Worker Admin staging sul limite effettivo
osservato di 10 ms, isolando i cold path POS e preservando catalogo completo,
mutazioni articolo, offline authorization, audit, RLS e fail-closed.

## Scope e limiti

- discovery read-only del piano/limiti Cloudflare disponibili;
- correlazione temporale dell'incidente Asus e delle probe vuote;
- confronto tra ultimo Worker noto funzionante e runtime corrente;
- rimozione degli import pesanti eager dalle route POS;
- boundary leggero e bounded prima del dominio specifico;
- chunk dinamici route-local verificati sull'output Next/OpenNext;
- first-login con client PostgREST/RPC leggero e compatibile Worker;
- test di regressione TASK-139/141/142/143/144/145/146;
- review indipendente, PR non-draft, CI e merge normale;
- tre deploy Worker staging distinti, uno per correzione;
- probe, catalog drain, mutation acceptance, cleanup e osservabilità;
- handoff Admin e prompt Asus finale.

Fuori scope e non modificati:

- billing o cambio piano Cloudflare;
- deploy production;
- Win7POS, Android e iOS;
- riduzione di righe/pagine catalogo o aumento timeout Supabase;
- lease, validazione, audit, RLS o grants;
- dati reali non-QA;
- secret, token, body, nomi prodotto, barcode o ID privati completi.

## Criteri di accettazione

1. Piano Cloudflare e limiti dichiarati con evidenza o `UNKNOWN`.
2. Root cause CPU correlata a invocazioni e grafo d'import.
3. POST catalogo vuoto/malformed restituisce 400 tipizzato, mai 503.
4. Metodi non supportati restituiscono 405 senza caricare il dominio.
5. Auth denial strutturalmente valido resta 401 tipizzato.
6. First-login e mutation caricano il dominio solo dopo envelope leggero.
7. Catalog read non importa policy catalog write o Admin access principal.
8. Bundle emesso dimostra chunk route-local e cold graph ridotto.
9. Full drain reale/current-manifest con conteggi esatti e zero skip.
10. Timestamp canonici e TASK-146 preservati.
11. Mutation create/update/price/stock/lifecycle/replay/conflict preservate.
12. Zero secret/raw body nei log e zero residuali sintetici dopo cleanup.
13. Review finale `P0/P1/P2/P3 = 0`.
14. CI richiesta verde, merge normale e main allineato.
15. Post-deploy: `exceededCpu=0`, `exceededMemory=0`, HTTP 503=0.
16. Production e client non Admin `NOT_MODIFIED`.
17. Handoff finale a `REVIEW_READY`, mai `DONE`.

Tutti i criteri risultano `PASS`.

## Piano e limiti Cloudflare

- `CLOUDFLARE_PLAN=UNKNOWN`: l'OAuth Wrangler disponibile non autorizza
  billing; nessuna inferenza è stata usata.
- `CONFIGURED_CPU_MS=ABSENT`.
- `EFFECTIVE_CPU_LIMIT_CLASS=10ms Free-compatible`, derivato dagli
  `exceededResources` esattamente a 10.000 microsecondi.
- `MEMORY_LIMIT=128MB`.
- Usage model e subrequest limit del piano: `UNKNOWN_NOT_EXPOSED_BY_AVAILABLE_OAUTH`.
- Binding finale: assets e self-service binding staging; nessuna route
  production.
- Billing: `NOT_MODIFIED`.

## Incidente e root cause

- Run Asus:
  `ASUSART_20260728T234251639Z_D04A9519`.
- Finestra: `2026-07-28T23:42:51.639Z ± 5 minuti`.
- Catalogo: 134 pagine ricevute; pagina fisica 135 fallita HTTP 503.
- Invocazione correlata: `exceededResources`, CPU 11.993 microsecondi, due
  subrequest, memoria circa 53 MB.
- Tre probe vuote: CPU 10.000 microsecondi, zero subrequest, memoria circa
  28 MB.
- Workers Observability storico non leggibile con l'OAuth disponibile:
  path, method, request ID e wall time storici restano `UNKNOWN`.

Il bundle noto buono misurava 8.980.641 byte minificati; la baseline corrente
9.029.044 byte. Il delta globale di circa 48 KiB non spiegava da solo il
problema. La causa era il grafo cold:

- catalog pull caricava staticamente circa 402 KiB di chunk applicativi,
  inclusi Supabase e access principal Shop Admin;
- first-login e article mutation importavano i servizi completi prima di
  leggere o rifiutare il body;
- dopo il primo fix, il first-login valido caricava ancora Supabase JS e
  superava il budget;
- dopo il secondo fix, `fetch(..., { redirect: "error" })` non era supportato
  da workerd e falliva prima della subrequest. Non era un nuovo CPU overrun.

## Implementazione

- `src/server/pos-auth/route-envelope.ts`:
  guard POS compatte e prive di dipendenze dominio.
- `src/app/api/pos/_shared/pos-route-security.ts`:
  body bounded e rejection audit canonico, a shape fissa e secret-free.
- Route catalog, first-login e mutation:
  metodi e envelope respinti prima dell'import dinamico del dominio.
- Helper credential lock estratto dal grafo Shop Admin.
- `src/server/pos-auth/first-login-core.ts`:
  unico core autorevole, condiviso dal percorso legacy e leggero.
- `src/server/pos-auth/first-login-service.ts`:
  wrapper runtime route-local.
- `src/server/pos-auth/runtime-rpc-client.ts`:
  client PostgREST/RPC bounded a 64 KiB, solo origin autorizzato, senza
  `supabase-js`; redirect `manual`, 3xx respinti e body cancellato.
- Eccezioni della verifica credential trasformate in `db_failure` tipizzato
  con audit bounded e senza testo errore o credential.
- Scanner e test bloccano reintroduzione di import eager, sink audit extra,
  campi sensibili, redirect follow e mancata cancellazione body.

Il dedicated POS Worker fallback non è stato necessario. Endpoint, lease,
audit, RLS, grants, offline authority, catalogo e mutazioni restano compatibili.

## Bundle e runtime

- Catalog cold graph prima: circa 402 KiB di chunk applicativi statici.
- Catalog cold graph finale: circa 94 KiB iniziali; dominio/Supabase in chunk
  dinamici separati.
- First-login dinamico finale: circa 21 KiB di chunk applicativi, senza
  `supabase-js`; trace totale 148.849 byte incluso runtime root/Turbopack.
- Build finale deployata:
  - upload `8.827,20 KiB`;
  - gzip `2.456,26 KiB`;
  - startup `40 ms`.
- Profilo Wrangler locale generato; il campionamento alpha era troppo sparso
  e hardware-dependent per attribuire CPU per sorgente, quindi non è usato
  come misura di acceptance.

## Review indipendente

Tre sequenze di review hanno coperto feature iniziale, first-login leggero e
compatibilità redirect Worker.

- Feature iniziale:
  finding successivi su guard non vuoti, audit anticipato, sink unico e shape
  audit; tutti corretti. Review runtime finale iniziale:
  `P0/P1/P2/P3 = 0/0/0/0`.
- First-login leggero:
  primo pass con redirect leak e implementazioni duplicate; entrambi corretti.
  Re-review: `P0/P1/P2/P3 = 0/0/0/0`.
- Redirect compatibility:
  primo pass con test P3 non vincolante sulla cancellazione body; corretto con
  `ReadableStream`, conteggio cancel e scanner.
  Re-review: `P0/P1/P2/P3 = 0/0/0/0`.
- Test reviewer sui codici 300/301/302/303/307/308:
  sei richieste all'origin autorizzato, zero al target, sei body cancellati.

## Delivery GitHub

| PR | Head | Merge normale | Esito |
| --- | --- | --- | --- |
| [#53](https://github.com/XNIW/merchandise-control-admin-web/pull/53) | `7932b14c` | `b9ab749d` | CI verde |
| [#54](https://github.com/XNIW/merchandise-control-admin-web/pull/54) | `b44d1c53` | `638fbc4a` | CI verde |
| [#55](https://github.com/XNIW/merchandise-control-admin-web/pull/55) | `cc7d4b8b` | `9fb54f50` | CI verde |

Verify/UI smoke, Cloudflare build/local smoke e pgTAP risultano verdi per le
PR runtime; i deploy automatici PR sono stati correttamente skipped.

## Deploy staging

Sono stati eseguiti esattamente tre deploy distinti, il massimo autorizzato.

| # | Timestamp UTC | Source | Deployment | Version | Startup | Bundle |
| ---: | --- | --- | --- | --- | ---: | --- |
| 1 | `2026-07-29T03:05:30.077843Z` | `b9ab749d` | `40fa2953` | `ecbb6b8f` | `27 ms` | 9.029.480 byte; gzip 2.450,39 KiB |
| 2 | `2026-07-29T04:00:52.983158Z` | `638fbc4a` | `e875c740` | `114da04e` | `34 ms` | 8.826,63 KiB; gzip 2.454,83 KiB |
| 3 | `2026-07-29T04:24:52.566733Z` | `9fb54f50` | `5ad3652d` | `57af0535` | `40 ms` | 8.827,20 KiB; gzip 2.456,26 KiB |

- Deploy 1: probe catalogo leggere e due drain reali completi senza 503;
  first-login valido cold ha confermato il residuo CPU da correggere.
- Deploy 2: first-login non ha eseguito subrequest per incompatibilità
  `redirect: "error"` di workerd; diagnosi locale riprodotta.
- Deploy 3: acceptance finale completa `PASS`.
- CPU configurata assente e classe effettiva 10 ms in tutti i deploy.
- Production: `NOT_MODIFIED`.

## Check finali

- focused TASK-147: `13/13 PASS` dopo first-login leggero;
- TASK-144 + TASK-147 finali: `20/20 PASS`;
- regressioni TASK-143/145/146: `30/30 PASS`;
- full foundation con Win7POS detached `e47981f6`: `PASS`;
- `npm run typecheck`: `PASS`;
- `npm run lint`: `PASS`;
- `npm run verify`: `PASS`;
- `npm run security:scan`: `PASS`;
- `npm run cf:build`: `PASS`;
- `npm run test:cloudflare:local`: `PASS`;
- migration parity linked: `PASS`, Supabase CLI `2.109.1`;
- SQL/pgTAP locale: `NOT_RUN_NOT_APPLICABLE`, nessun SQL modificato;
- pgTAP CI: `PASS`;
- Codex Security diff scan iniziale: coverage runtime `10/10`, finding `0`;
- seconda scan nativa:
  `NOT_RUN_NATIVE_SETUP_NOT_STARTED`; delta coperto da security scan locale,
  test dedicati e review indipendente finale zero-gate.

## Acceptance staging finale

Finestra business:
`2026-07-29T04:31:15.503Z` - `2026-07-29T04:35:04.755Z`.

- First-login valido cold: HTTP 200, `1.370,3 ms`.
- Catalogo reale:
  - 676 pagine con limite 1.000;
  - categorie 71;
  - fornitori 102;
  - prodotti 19.763;
  - prezzi attivi 41.228;
  - manifest esatto, revisioni canoniche, zero duplicati/skip;
  - first page `2.178,8 ms`, media `301,1 ms`, p90 `408,7 ms`;
  - baseline reale invariata dopo il run.
- Matrice sintetica:
  - 9 `applied`;
  - replay `duplicate_replay`;
  - mismatch `idempotency_payload_mismatch`;
  - stale `failed_conflict`;
  - ACK/catalog byte equality e offline authority `PASS`;
  - 10 receipt, 1 conflict receipt, 2 price, 2 movement;
  - sales/revenue `0/0`;
  - 11 audit prima del cleanup, chiavi vietate `0`, massimo 107 byte.
- Cleanup:
  - catalogo, mapping, membership, runtime e shop sintetici attivi `0`;
  - audit immutabili preservati;
  - sessione reale attiva residua `0`.
- Business requests: 725; HTTP 503: `0`.

Un primo drain sul deploy finale ha completato 676 pagine e 677 richieste con
zero 503, ma il harness ha confrontato il manifest con una baseline che
includeva 95 prezzi di prodotti eliminati. Il solo verificatore temporaneo è
stato corretto per replicare l'`exists` SQL del manifest; nessun dato o runtime
è stato cambiato. Il rerun completo sopra è `PASS`.

Probe leggere finali, 20 ciascuna:

- catalog malformed: 20 x 400, first 182,5 ms, warm avg 65,4 ms;
- catalog GET: 20 x 405, first 55,5 ms, warm avg 55,1 ms;
- first-login malformed: 20 x 400, first 52,7 ms, warm avg 77,6 ms;
- mutation malformed: 20 x 400, first 56,9 ms, warm avg 55,5 ms;
- totale 80, HTTP 503 `0`.

Osservabilità dal deploy finale a `2026-07-29T04:36:00.645Z`:

- 1.502 invocazioni, tutte `success`;
- errori/unhandled exceptions `0`;
- `exceededCpu=0`;
- `exceededMemory=0`;
- subrequest 4.250;
- CPU microsecondi p50 7.844, p90 10.765, p99 34.713, p999 319.475;
- wall seconds p50 0,0235, p90 0,0328, p99 0,1021, p999 0,3195;
- memoria byte p50 53.081.080, p90 59.186.572, p99 63.839.548,
  p999 64.136.544;
- HTTP 503 osservati dal business harness e dalle probe: `0`.

La distribuzione può superare 10 ms per invocazioni con rollover/burst; il
criterio decisivo è l'assenza di outcome `exceededCpu`, verificata.

## Stato operativo

`SUPERSEDED_BY_FINAL_POS_ARTICLE_SYNC_CLEANUP_PASS`

L'accettazione article-sync successiva e il cleanup consolidato staging sono
`PASS`. Il task resta in governance `REVIEW_READY` fino alla conferma del
reviewer; Windows 7 fisico resta `EXTERNAL_PENDING`.

## Closeout finale article-sync 2026-07-30

- Win7POS final acceptance: `PASS`.
- Cleanup consolidato exact-ID: `PASS`; residui target `0`.
- Audit immutabile: `PRESERVED`; invarianti non-target: `UNCHANGED`.
- Review tecnica piano/transazione e outcome:
  `P0/P1/P2/P3 = 0/0/0/0`.
- Worker deploy aggiunti dal closeout: `0`; runtime Worker invariato.
- Production, Win7POS, Android e iOS: `NOT_MODIFIED`.
- Windows 7 fisico: `EXTERNAL_PENDING`.
- Conferma esplicita finale dell'utente: `RECEIVED`.
- Stato governance: `DONE / USER_CONFIRMED_CLOSURE`.
