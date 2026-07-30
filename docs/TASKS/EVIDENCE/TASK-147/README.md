# Evidence TASK-147

## Regole

- Nessun secret, token, PIN, email account, body, nome prodotto o barcode.
- Gli ID Cloudflare sono abbreviati; i valori completi restano solo nelle
  risposte CLI locali.
- Gli identificatori business sono rappresentati solo da conteggi o hash
  frozen troncati.
- Ogni `PASS` deriva da un comando o una verifica realmente eseguiti.

## Baseline

- Admin iniziale:
  `293b067f54723ef8e9811a078f9f9f40ae34d33b`.
- Win7POS read-only:
  `e47981f6dccbee86150b01f526e0ec6bf484afcc`.
- Checkout Win7POS dirty dell'utente: preservato; test su worktree detached.
- Worker pre-fix: deployment `25d2dd12`, version `edd39bb4`, startup 43 ms.
- Worker noto buono: deployment `bbdc35a8`, version `66eeda7f`.
- Main runtime finale:
  `9fb54f50999b8587bc37f5e2040743df20df8f08`.
- Production, Win7POS, Android, iOS e billing: `NOT_MODIFIED`.

## Limiti Cloudflare

- `CLOUDFLARE_PLAN=UNKNOWN`.
- `CONFIGURED_CPU_MS=ABSENT`.
- `EFFECTIVE_CPU_LIMIT_CLASS=10ms Free-compatible`.
- `MEMORY_LIMIT=128MB`.
- Usage model/subrequest limit:
  `UNKNOWN_NOT_EXPOSED_BY_AVAILABLE_OAUTH`.
- Il token OAuth Wrangler non autorizza letture billing; nessuna modifica o
  inferenza sul piano.

## Incidente

- Run:
  `ASUSART_20260728T234251639Z_D04A9519`.
- Window:
  `2026-07-28T23:42:51.639Z ± 5 minuti`.
- Catalog page fisica 135:
  `exceededResources`, CPU 11.993 microsecondi, due subrequest, memoria circa
  53 MB, HTTP 503.
- Tre probe vuote:
  CPU 10.000 microsecondi, zero subrequest, memoria circa 28 MB.
- Workers Observability storico:
  `403 Authentication error`; path/method/request ID/wall time storici
  `UNKNOWN`.

## Root cause e grafo

- Noto buono:
  upload minificato 8.980.641 byte.
- Baseline:
  upload minificato 9.029.044 byte;
  catalog cold graph circa 402 KiB.
- Route isolation:
  catalog cold graph finale circa 94 KiB;
  catalogo/Supabase in chunk dinamici.
- First-login leggero:
  circa 21 KiB di chunk applicativi, senza `supabase-js`;
  trace totale 148.849 byte incluso root/Turbopack.

Cause distinte:

1. import eager dei servizi completi prima del light guard;
2. first-login valido ancora dipendente da Supabase JS dopo il primo fix;
3. `redirect: "error"` non supportato da workerd dopo il secondo fix.

La terza causa falliva prima della subrequest ed è stata riprodotta localmente;
non era un nuovo overrun CPU. Il client finale usa `manual`, rifiuta ogni 3xx,
cancella il body e non segue l'origin target.

## File runtime

- `src/app/api/pos/_shared/pos-route-security.ts`
- `src/app/api/pos/auth/first-login/route.ts`
- `src/app/api/pos/catalog/article-mutations/route.ts`
- `src/app/api/pos/catalog/pull/route.ts`
- `src/server/pos-auth/route-envelope.ts`
- `src/server/pos-auth/staff-credential-lock-state.ts`
- `src/server/pos-auth/first-login-core.ts`
- `src/server/pos-auth/first-login-service.ts`
- `src/server/pos-auth/runtime-rpc-client.ts`
- import type/helper corretti nei servizi POS e Shop Admin correlati
- `scripts/security-checks.mjs`
- test foundation TASK-021/068/072/079/081/087/088/089/143/144/145/147

Nessuna migration, dipendenza o dedicated Worker aggiunti.

## Review indipendente

- Feature iniziale, dopo quattro iterazioni di hardening guard/audit:
  `P0/P1/P2/P3 = 0/0/0/0`.
- First-login leggero, dopo correzione redirect leak e core duplicato:
  `P0/P1/P2/P3 = 0/0/0/0`.
- Redirect compatibility, dopo correzione del test cancel:
  `P0/P1/P2/P3 = 0/0/0/0`.
- Matrice reviewer 300/301/302/303/307/308:
  6 origin call, 0 target call, 6 response body cancellati.

## Check

- focused TASK-147 dopo first-login: `13/13 PASS`.
- TASK-144 + TASK-147 finali: `20/20 PASS`.
- regressioni TASK-143/145/146: `30/30 PASS`.
- full foundation con Win7POS detached `e47981f6`: `PASS`.
- `npm run typecheck`: `PASS`.
- `npm run lint`: `PASS`.
- `npm run verify`: `PASS`.
- `npm run security:scan`: `PASS`.
- `npm run cf:build`: `PASS`.
- `npm run test:cloudflare:local`: `PASS`.
- `git diff --check`: `PASS`.
- migration parity linked con Supabase CLI `2.109.1`: `PASS`.
- SQL/pgTAP locale:
  `NOT_RUN_NOT_APPLICABLE`, nessun SQL modificato.
- CI PR runtime:
  Verify/UI smoke, Cloudflare build/local smoke e pgTAP `PASS`; deploy job
  PR correttamente `SKIPPED`.
- Codex Security diff scan iniziale:
  coverage runtime `10/10`, finding `0`, rinvii `0`.
- Seconda scan nativa:
  `NOT_RUN_NATIVE_SETUP_NOT_STARTED`; coperta da scan locale, test e review
  indipendente zero-gate.

## GitHub

| PR | Head | Merge normale | Required CI |
| --- | --- | --- | --- |
| [#53](https://github.com/XNIW/merchandise-control-admin-web/pull/53) | `7932b14c` | `b9ab749d` | PASS |
| [#54](https://github.com/XNIW/merchandise-control-admin-web/pull/54) | `b44d1c53` | `638fbc4a` | PASS |
| [#55](https://github.com/XNIW/merchandise-control-admin-web/pull/55) | `cc7d4b8b` | `9fb54f50` | PASS |

Nessun force, squash o bypass; merge normali su head revisionate.

## Deploy staging

| # | Timestamp UTC | Source | Deployment | Version | Startup | Size |
| ---: | --- | --- | --- | --- | ---: | --- |
| 1 | `2026-07-29T03:05:30.077843Z` | `b9ab749d` | `40fa2953` | `ecbb6b8f` | 27 ms | 9.029.480 byte; gzip 2.450,39 KiB |
| 2 | `2026-07-29T04:00:52.983158Z` | `638fbc4a` | `e875c740` | `114da04e` | 34 ms | 8.826,63 KiB; gzip 2.454,83 KiB |
| 3 | `2026-07-29T04:24:52.566733Z` | `9fb54f50` | `5ad3652d` | `57af0535` | 40 ms | 8.827,20 KiB; gzip 2.456,26 KiB |

Tre correzioni distinte, tre deploy; limite autorizzato esaurito. Nessun
redeploy identico e nessun deploy production.

## Evidence deploy 1

- Probe catalogo leggere: nessun 503.
- Due drain reali completi da 676 pagine:
  manifest esatto, 55 categorie, 83 fornitori, 19.746 prodotti, 41.158
  prezzi, zero skip e zero 503.
- Un run separato ha incontrato una risposta HTTP 200 non valida a pagina 295;
  il repeat full drain ha completato 676 pagine. Nessuna modifica è stata
  introdotta sulla base del singolo evento.
- First-login valido cold:
  `exceededResources`, CPU 10.000 microsecondi; ha motivato il secondo fix.

## Evidence deploy 2

- First-login valido HTTP 500, zero 503.
- GraphQL: una invocazione `success`, errori 0, subrequest 0, CPU 371.468
  microsecondi, wall 0,371 s.
- Direct PostgREST lookup/audit da Node: `PASS`.
- Local workerd:
  `redirect: "error"` rifiutato prima della rete; `redirect: "manual"`
  riprodotto `PASS`.

## Acceptance locale prima del deploy 3

- First-login valido e matrice articolo completa: `PASS`.
- 9 applied, 10 receipt, 1 conflict receipt, 2 movement, 2 price.
- Replay/mismatch/stale:
  `duplicate_replay` / `idempotency_payload_mismatch` / `failed_conflict`.
- ACK/catalog byte equality e offline authority: `PASS`.
- Audit mutation 11, forbidden keys 0, massimo 107 byte.
- Cleanup attivo catalog/mapping/member/runtime/shop: tutti 0.
- Baseline catalogo reale invariata.
- Richieste 48, HTTP 503 0.

## Acceptance pubblica deploy 3

Finestra:
`2026-07-29T04:31:15.503Z` -
`2026-07-29T04:35:04.755Z`.

### Catalogo reale

- Shop frozen hash: `67545716fda89c02`.
- First-login cold: HTTP 200, 1.370,3 ms.
- Full/current-manifest drain: 676 pagine, limite 1.000.
- 71 categorie, 102 fornitori, 19.763 prodotti, 41.228 prezzi attivi.
- Manifest esatto, timestamp canonici, zero duplicati, zero skip.
- First page 2.178,8 ms, media 301,1 ms, p50 271,0 ms, p90 408,7 ms.
- Baseline non-QA invariata.

Il primo full drain sul deploy 3 ha completato 676 pagine e 677 richieste con
zero 503, ma il verificatore includeva nella baseline 95 prezzi collegati a
prodotti eliminati. Il solo harness temporaneo è stato allineato all'`exists`
SQL del manifest; nessun runtime o dato reale è stato cambiato. Il rerun
completo è `PASS`.

### Matrice articolo sintetica

- Create, update, duplicate, retail, purchase, stock +, stock -, deactivate e
  reactivate: `applied` (9).
- Replay: `duplicate_replay`.
- Payload mismatch: `idempotency_payload_mismatch`.
- Stale: `failed_conflict`.
- Receipt 10, conflict receipt 1, price 2, movement 2.
- Sales/revenue 0/0.
- ACK/catalog byte equality e offline authority: `PASS`.
- Catalogo sintetico finale:
  1 categoria, 1 fornitore, 2 prodotti, 2 prezzi, 4 pagine.
- Audit prima del cleanup:
  11 row, forbidden keys 0, metadata massimo 107 byte.

### Cleanup

- Eliminati soltanto target sintetici:
  1 categoria, 1 fornitore, 2 prodotti, 2 prezzi, 2 movement, 10 receipt,
  1 conflict receipt, 13 sync event, 1 revision.
- Catalogo, mapping, membership, runtime e shop sintetici attivi: 0.
- Sessione reale attiva residua: 0.
- Audit immutabili preservati: 12.
- Baseline reale: invariata.

### Richieste e probe

- Business acceptance:
  725 richieste, 12 mutation, 711 catalog, 2 first-login, HTTP 503 0.
- Probe finali, 20 ciascuna:
  - catalog malformed: 20 x 400; first 182,5 ms; warm avg 65,4 ms;
  - catalog GET: 20 x 405; first 55,5 ms; warm avg 55,1 ms;
  - first-login malformed: 20 x 400; first 52,7 ms; warm avg 77,6 ms;
  - mutation malformed: 20 x 400; first 56,9 ms; warm avg 55,5 ms.
- Probe totali: 80, HTTP 503 0.

### Cloudflare window

Da `2026-07-29T04:24:52.566733Z` a
`2026-07-29T04:36:00.645Z`:

- invocation 1.502, tutte `success`;
- errori/eccezioni 0;
- `exceededCpu=0`;
- `exceededMemory=0`;
- subrequest 4.250;
- CPU µs p50/p90/p99/p999:
  7.844 / 10.765 / 34.713 / 319.475;
- wall s p50/p90/p99/p999:
  0,0234695 / 0,032826625 / 0,102081 / 0,319475;
- memory bytes p50/p90/p99/p999:
  53.081.080 / 59.186.572 / 63.839.548 / 64.136.544;
- HTTP 503 nei client acceptance/probe: 0.

## Verdict

- Criteri runtime e business: `PASS`.
- Review finale: `ZERO-GATE PASS`.
- Production/client/billing: `NOT_MODIFIED`.
- Task: `REVIEW_READY`, non `DONE`.
- Handoff storico pre-TASK-148:
  `READY_FOR_ASUS_FINAL_ARTICLE_SYNC_ACCEPTANCE`.

## Closeout consolidato 2026-07-30

- Win7POS final acceptance: `PASS`.
- Cleanup staging exact-ID: `PASS`; residui sintetici target `0`.
- Audit immutabile: `PRESERVED`; baseline non-target: `UNCHANGED`.
- Review tecnica piano/transazione e outcome:
  `P0/P1/P2/P3 = 0/0/0/0`.
- Worker deploy aggiunti: `0`; deployment/version staging invariati.
- Production, Win7POS, Android e iOS: `NOT_MODIFIED`.
- Windows 7 fisico: `EXTERNAL_PENDING`.
- Handoff precedente: superseded da
  `docs/HANDOFFS/WIN7POS_POS_ARTICLE_SYNC_FINAL_CLEANUP.md`.
- Conferma esplicita finale dell'utente: `RECEIVED`.
- Stato: `DONE / USER_CONFIRMED_CLOSURE`.
