# Win7POS final article sync CPU remediation handoff

## Stato

- Task Admin: `TASK-147`
- Stato: `REVIEW_READY`, non `DONE`
- Handoff:
  `READY_FOR_ASUS_FINAL_ARTICLE_SYNC_ACCEPTANCE`
- Admin runtime finale:
  `9fb54f50999b8587bc37f5e2040743df20df8f08`
- Win7POS baseline minima read-only:
  `e47981f6dccbee86150b01f526e0ec6bf484afcc`
- Win7POS, Android, iOS, production e billing: `NOT_MODIFIED`

Questo handoff sblocca esclusivamente l'accettazione Asus finale già prevista.
Non autorizza un deploy production o modifiche ai dati reali non-QA.

## Delivery Admin

Tre correzioni distinte sono state mergiate normalmente:

| PR | Head | Merge |
| --- | --- | --- |
| [#53](https://github.com/XNIW/merchandise-control-admin-web/pull/53) | `7932b14c` | `b9ab749d` |
| [#54](https://github.com/XNIW/merchandise-control-admin-web/pull/54) | `b44d1c53` | `638fbc4a` |
| [#55](https://github.com/XNIW/merchandise-control-admin-web/pull/55) | `cc7d4b8b` | `9fb54f50` |

- CI Verify/UI smoke, Cloudflare build/local smoke e pgTAP: `PASS`.
- Review indipendente finale per ciascuna sequenza:
  `P0/P1/P2/P3 = 0/0/0/0`.
- Nessuna migration o nuova dipendenza.

File runtime toccati:

- `src/app/api/pos/_shared/pos-route-security.ts`;
- `src/app/api/pos/auth/first-login/route.ts`;
- `src/app/api/pos/catalog/article-mutations/route.ts`;
- `src/app/api/pos/catalog/pull/route.ts`;
- `src/server/pos-auth/route-envelope.ts`;
- `src/server/pos-auth/staff-credential-lock-state.ts`;
- `src/server/pos-auth/first-login-core.ts`;
- `src/server/pos-auth/first-login-service.ts`;
- `src/server/pos-auth/runtime-rpc-client.ts`;
- servizi POS correlati aggiornati per usare import type/helper leggeri;
- `scripts/security-checks.mjs`;
- test foundation TASK-021/068/072/079/081/087/088/089/143/144/145/147.

File di closeout:

- `docs/MASTER-PLAN.md`;
- `docs/TASKS/TASK-147-admin-staging-worker-cpu-remediation.md`;
- `docs/TASKS/EVIDENCE/TASK-147/README.md`;
- questo handoff.

## Piano e limiti

- Cloudflare plan:
  `UNKNOWN`, perché l'OAuth Wrangler disponibile non autorizza billing.
- `limits.cpu_ms`:
  `ABSENT`.
- Classe effettiva osservata:
  `10ms Free-compatible`.
- Memoria:
  `128MB`.
- Usage model/subrequest limit:
  `UNKNOWN_NOT_EXPOSED_BY_AVAILABLE_OAUTH`.
- Billing change:
  `NO`.

## Incidente risolto

- Run Asus:
  `ASUSART_20260728T234251639Z_D04A9519`.
- Timestamp:
  `2026-07-28T23:42:51.639Z`.
- 134 pagine catalogo ricevute; pagina fisica 135 HTTP 503.
- Outcome:
  `exceededResources`, CPU 11.993 microsecondi, due subrequest, memoria circa
  53 MB.
- Probe vuote:
  CPU 10.000 microsecondi, zero subrequest, memoria circa 28 MB.

## Root cause e correzione

Il catalog pull caricava circa 402 KiB di chunk applicativi sul cold path,
inclusi Supabase e access principal Shop Admin. First-login e article mutation
caricavano inoltre i servizi completi prima di validare l'envelope.

La correzione:

- valida metodo, dimensione e struttura con helper piccoli;
- restituisce 400/401/405 senza caricare il dominio;
- importa catalog, mutation e first-login solo dopo il light guard;
- mantiene audit rejection a shape fissa e senza body/token;
- estrae il credential lock dal grafo Shop Admin;
- usa un unico first-login core autorevole;
- sostituisce Supabase JS sul first-login route-local con un client RPC
  PostgREST bounded a 64 KiB;
- non segue redirect: usa `manual`, respinge ogni 3xx e cancella il body.

Il catalog cold graph finale è circa 94 KiB. Il first-login dinamico applicativo
è circa 21 KiB e non contiene `supabase-js`. Non è stato necessario creare un
Worker POS separato.

## Worker staging finale

- Source:
  `9fb54f50`.
- Deploy:
  `5ad3652d`.
- Version:
  `57af0535`.
- Timestamp:
  `2026-07-29T04:24:52.566733Z`.
- Upload:
  `8.827,20 KiB`.
- Gzip:
  `2.456,26 KiB`.
- Startup:
  `40 ms`.
- Production deploy:
  `NO`.

Sono stati usati esattamente tre deploy distinti autorizzati:

1. `b9ab749d` / `40fa2953` / `ecbb6b8f`, startup 27 ms;
2. `638fbc4a` / `e875c740` / `114da04e`, startup 34 ms;
3. `9fb54f50` / `5ad3652d` / `57af0535`, startup 40 ms.

## Acceptance server-side finale

Finestra:
`2026-07-29T04:31:15.503Z` -
`2026-07-29T04:35:04.755Z`.

Catalogo reale Asus shop scope:

- first-login cold:
  HTTP 200, 1.370,3 ms;
- 676 pagine, limite 1.000;
- categorie 71;
- fornitori 102;
- prodotti 19.763;
- prezzi attivi 41.228;
- manifest esatto;
- revisioni canoniche;
- duplicati/skip/503: `0/0/0`;
- first page 2.178,8 ms;
- media pagina 301,1 ms, p90 408,7 ms;
- baseline reale invariata.

Matrice articolo su shop sintetico separato:

| Caso | Esito |
| --- | --- |
| create | `applied` |
| update | `applied` |
| duplicate | `applied` |
| retail price | `applied` |
| purchase price | `applied` |
| stock plus | `applied` |
| stock minus | `applied` |
| deactivate | `applied` |
| reactivate | `applied` |
| replay | `duplicate_replay` |
| payload mismatch | `idempotency_payload_mismatch` |
| stale base | `failed_conflict` |

- ACK/catalog byte equality:
  `PASS`.
- Offline authority:
  `PASS`.
- Receipt/conflict receipt:
  `10/1`.
- Price/movement:
  `2/2`.
- Sales/revenue:
  `0/0`.
- Audit mutation prima del cleanup:
  11, forbidden keys 0, massimo 107 byte.

Cleanup:

- eliminati solo gli ID sintetici esatti;
- catalogo, mapping, member, runtime e shop attivi residui: `0`;
- sessione reale attiva residua: `0`;
- audit immutabili preservati;
- baseline reale invariata.

Richieste business:
725, HTTP 503 `0`.

## Light probes e osservabilità

Probe finali:

- 20 catalog malformed: 400;
- 20 catalog GET: 405;
- 20 first-login malformed: 400;
- 20 mutation malformed: 400;
- totale 80, HTTP 503 `0`.

Cloudflare dal deploy finale al termine acceptance:

- 1.502 invocazioni, tutte `success`;
- `exceededCpu=0`;
- `exceededMemory=0`;
- errori/eccezioni `0`;
- subrequest 4.250;
- CPU µs p50/p90/p99/p999:
  7.844 / 10.765 / 34.713 / 319.475;
- memoria p99:
  63.839.548 byte, sotto 128 MB.

## Invarianti da preservare su Asus

- Usare il profilo DPAPI esistente; non reinserire o stampare credenziali.
- Preservare la modifica dialog già presente nel checkout utente.
- Non modificare endpoint o profilo se il main Win7POS è `e47981f6` o
  successivo compatibile.
- Completare la matrice articolo intera; non fermarsi al solo catalog drain.
- Usare solo fixture sintetiche marcate e cleanup per ID esatti.
- Conservare audit immutabili e produrre un cleanup manifest senza valori
  sensibili.
- Non riusare i run Asus precedenti; sono autorizzati fino a tre run nuovi,
  distinti ed evidence-backed dopo questo fix server.
- Se emerge un difetto client/harness, correggerlo e validarlo senza indebolire
  il server o consumare run identici.

## Check Admin

- TASK-144 + TASK-147:
  `20/20 PASS`.
- regressioni TASK-143/145/146:
  `30/30 PASS`.
- foundation completa con Win7POS detached `e47981f6`:
  `PASS`.
- typecheck, lint, verify, security, Cloudflare build e Worker local smoke:
  `PASS`.
- migration parity:
  `PASS`.

## Criteri e rischi residui

Criteri TASK-147:

- route light 400/401/405 senza eager domain load: `PASS`;
- catalogo completo/current-manifest esatto: `PASS`;
- timestamp canonici e article mutation v1: `PASS`;
- offline authority, audit, RLS/grants e fail-closed: `PASS`;
- review zero-gate, CI e merge normali: `PASS`;
- `exceededCpu`, `exceededMemory`, eccezioni e HTTP 503 finali: tutti `0`;
- cleanup sintetico e baseline reale invariata: `PASS`.

Rischi residui:

- il nome del piano e i limiti usage/subrequest restano `UNKNOWN` per
  autorizzazione OAuth read-only insufficiente; billing non è necessario per
  il runtime validato;
- i conteggi del catalogo reale possono evolvere prima del run Asus: il client
  deve confrontare il manifest dello stesso snapshot, non congelare i numeri
  di questa acceptance;
- un singolo run storico ha ricevuto una risposta HTTP 200 non valida a pagina
  295; i drain completi successivi, incluso quello finale, sono passati;
- resta da eseguire l'accettazione end-to-end sul dispositivo Asus. Questo è
  il prossimo gate, non un difetto server aperto.

Prossima fase:

1. eseguire
   `/Users/minxiang/Projects/NEXT-CODEX-ASUS-FINAL-ACCEPTANCE.md`;
2. usare il profilo DPAPI e il dialog esistenti;
3. completare catalogo, matrice articoli e cleanup;
4. al PASS restituire `READY_FOR_MAC_FINAL_CLEANUP`.

Stato finale Admin:
`READY_FOR_ASUS_FINAL_ARTICLE_SYNC_ACCEPTANCE`.
