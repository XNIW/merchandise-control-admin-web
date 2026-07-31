# Evidence TASK-149

## Baseline

- Admin:
  `710ff981f7bb0381159724ec02bbfec39a27eedf`.
- Win7POS main read-only:
  `f34308b24fd30d0b85845429f1ece97cc5106c6d`.
- Win7POS PR `#72` head read-only:
  `b43473f9c959a86403fa0f0a012f798d15af553e`.
- Portable contract SHA-256:
  `b6212f36f27a6dc294713ca7345a29ff8d1a73733b9edb5d8e1a5c3b8ec14672`.
- Branch:
  `codex/admin-pos-product-image-v1-20260730`.
- Runtime feature/merge:
  `d7fe4eced2b8bcd015dd66b38baa30bc4619182f` /
  `1de2912419f6770ff1ef7c6819754f4439ab849f`.
- Tooling Tail feature/merge:
  `a3347120d8686afe24c68ed9c1318f2c3e9647eb` /
  `d3c674ada8aa7abf0179355c09238472b9ff3023`.
- Production, Win7POS, Android e iOS:
  `NOT_MODIFIED`.

## Stato gate

- Contract/server delta: `PASS_LOCAL`.
- Implementazione: `PASS_LOCAL`.
- Focused test: `PASS`, `28/28`.
- Foundation: `PASS`.
- Verify: `PASS`.
- Cloudflare build/smoke: `PASS_LOCAL`.
- Supabase reset/pgTAP/lint: `PASS_LOCAL`.
- Security/import graph: `PASS_LOCAL`.
- Review P0/P1/P2/P3: `PASS`, `0/0/0/0`.
- PR runtime `#59` / CI / merge normale: `PASS`.
- Migration parity/apply staging: `PASS`, `97/97`, una sola apply.
- DB lint linked `public,app_private`: `PASS`, zero errori.
- Deploy staging: `PASS`, `1/3`; production `0`.
- PR tooling `#60` / CI / merge normale: `PASS`.
- Deploy successivi al tooling: `0`.
- Primo live gate: `BLOCKED_TASK149_TAIL_COVERAGE_INCOMPLETE`, fail-closed.
- Cleanup indipendente primo run: `PASS`, residui run-scoped `0`.
- Secondo live gate:
  `PASS`, schema `task149-pos-product-image-resource-gate-v2`, Tail/GraphQL `34/34`, cold/warm/full-drain `1/32/1`,
  CASE46/CASE48 `2/2`, errori e forbidden match `0`.
- Cleanup/residui finali:
  `PASS`, candidate group `1`, shop archiviato `1`, Auth inattivi/attivi `2/0`, righe attore attive `0`,
  tutti i residui DB/Storage/budget `0`, audit preservati `11`, forbidden `0`.
- Deployment/source/version recheck:
  `PASS`, Worker source `1de2912419f6770ff1ef7c6819754f4439ab849f`, versione attiva `100%`,
  deployment/version invariati durante gate e recheck indipendente, nessun deploy dopo PR `#60`.

## Evidence locale pre-merge

- `node --test --test-name-pattern='TASK-149'
tests/foundation/task-149-pos-product-image-v1.test.mjs`:
  `PASS`, 28 test, zero fail/skip/todo.
- `WIN7POS_REPO_PATH=<clone-read-only> npm run test:foundation`:
  `PASS`.
- `npm run lint`, `npm run typecheck`, `npm run security:scan`:
  `PASS`.
- `npm run verify`: `PASS`, build Next.js 16.2.6 incluso.
- `npm run cf:build`: `PASS`.
- `npm run check:pos-worker-bundle`: `PASS`, 7/7 entrypoint; gli
  entrypoint POS legacy misurano `94019`, `93454` e `93640` byte senza
  aumento di baseline o tolleranza.
- `npm run test:cloudflare:local`: `PASS`; le quattro route immagini
  restituiscono il light guard `400`, il method guard `405`, header di
  sicurezza e `no-store`.
- Replay completo delle migration su database Supabase locale isolato:
  `PASS`.
- `supabase test db --local
supabase/tests/task_149_pos_product_image_v1.sql`:
  `PASS`, 162/162.
- `supabase test db --local`: `PASS`, 17 file e 1251/1251 test.
- `supabase db lint --local --schema public,app_private --fail-on error`:
  `PASS`, zero errori; restano solo warning baseline.
- `supabase migration list --local`: `PASS`, migration TASK-149 presente e
  applicata nel solo database locale.
- Gitleaks sui 45 file modificati/non tracciati: `PASS`, zero finding.
- `git diff --check`: `PASS`.
- Migration SHA-256:
  `b4eb344f4bb73ae8cfbcb5ef10ed53f2959694caf814c53c78978d7c450d6511`.
- pgTAP TASK-149 SHA-256:
  `b4bef250f16009eae87325c97dcf438014adb9384e6f6a6eac71e56377a0af1b`.
- Harness staging SHA-256:
  `06e8116f60e16b827b298e84b4d710ae2d5e40be802da9a217918af792279f9f`.
- Resource gate SHA-256:
  `e658a40f5b56620775b1be9cb784c595b2be9cf87fbdd513ebdcddcd8243ed28`.
- Harness staging post-PR `#60` SHA-256:
  `2d364afaacfa5e0bc6ea02445fd8ea09938ce11516941eb35465614d8440d9b1`.
- Resource gate post-PR `#60` SHA-256:
  `04442d32d71149904d4453dfbf371d55856785ce8efd14f6af6a5831dfb43415`.
- Focused test post-PR `#60` SHA-256:
  `c9a3186b55a5a442b0182747f766ee692884268ca67f86927f94c33c0cd0fff6`.
- Server delta SHA-256:
  `5941f02def1992f4d9d16f4c787a4cabf3e736d740de5bce767f7f990b4b832e`.

Il primo tentativo del gate bundle ha rilevato correttamente un aumento di
213–262 byte sugli entrypoint POS legacy. Il validator immagini è stato quindi
estratto in `product-image-envelope.ts`; `route-envelope.ts` è tornato
byte-identico alla baseline e il rerun 7/7 è passato senza cambiare soglie.

Il recheck avversariale pre-merge ha inoltre forzato quattro hardening
fail-closed dell’evidence: il full-drain è confrontato con un manifest DB
service-role indipendente e snapshot-bound; il cleanup recupera anche risposte
Auth perse e prova entrambi gli attori bannati; log/audit rifiutano chiavi,
URL e path Storage canonici; Wrangler riceve un ambiente minimo senza
service-role e `cpuTime` Tail è convertito esplicitamente da millisecondi a
microsecondi. I relativi casi negativi sono inclusi nei 28 test focused.

## Matrice casi server 1–48

`PASS_LOCAL` indica evidence foundation, pgTAP, security, bundle o smoke locale.
`PASS_STAGING` indica il marker live promosso dal secondo gate verificato.

| Caso | Scenario                                    | Evidence TASK-149              |
| ---: | ------------------------------------------- | ------------------------------ |
|   01 | Valid session                               | `PASS_LOCAL / PASS_STAGING` |
|   02 | Expired session                             | `PASS_LOCAL`                   |
|   03 | Revoked device                              | `PASS_LOCAL`                   |
|   04 | Wrong shop                                  | `PASS_LOCAL`                   |
|   05 | Read-only staff write denial                | `PASS_LOCAL`                   |
|   06 | Malformed envelope                          | `PASS_LOCAL / PASS_STAGING` |
|   07 | Unknown app version policy                  | `PASS_LOCAL / PASS_STAGING` |
|   08 | Valid replacement intent                    | `PASS_LOCAL / PASS_STAGING` |
|   09 | Intent product not found                    | `PASS_LOCAL`                   |
|   10 | Intent expected-version conflict            | `PASS_LOCAL`                   |
|   11 | Invalid JPEG metadata                       | `PASS_LOCAL`                   |
|   12 | Intent replay same hash                     | `PASS_LOCAL / PASS_STAGING` |
|   13 | Intent replay different hash                | `PASS_LOCAL`                   |
|   14 | Valid finalize                              | `PASS_LOCAL / PASS_STAGING` |
|   15 | Finalize missing object                     | `PASS_LOCAL`                   |
|   16 | Finalize MIME mismatch                      | `PASS_LOCAL`                   |
|   17 | Finalize hash mismatch                      | `PASS_LOCAL`                   |
|   18 | Finalize byte mismatch                      | `PASS_LOCAL`                   |
|   19 | Finalize dimension mismatch                 | `PASS_LOCAL`                   |
|   20 | Finalize corrupt JPEG                       | `PASS_LOCAL`                   |
|   21 | Finalize replay                             | `PASS_LOCAL / PASS_STAGING` |
|   22 | Failed finalize preserves current           | `PASS_LOCAL`                   |
|   23 | Finalize revision publication               | `PASS_LOCAL / PASS_STAGING` |
|   24 | Zero/missing image resolves without signing | `PASS_LOCAL`                   |
|   25 | Read ready image                            | `PASS_LOCAL / PASS_STAGING` |
|   26 | Read removed or superseded denial           | `PASS_LOCAL`                   |
|   27 | Read batch sixteen                          | `PASS_LOCAL`                   |
|   28 | Read batch seventeen rejected               | `PASS_LOCAL`                   |
|   29 | Signed URL bounded TTL and memory-only      | `PASS_LOCAL / PASS_STAGING` |
|   30 | Signed URL absent from logs                 | `PASS_LOCAL`                   |
|   31 | Valid remove                                | `PASS_LOCAL / PASS_STAGING` |
|   32 | Remove expected-version conflict            | `PASS_LOCAL`                   |
|   33 | Remove replay one-shot                      | `PASS_LOCAL / PASS_STAGING` |
|   34 | Remove cleanup pending                      | `PASS_LOCAL / PASS_STAGING` |
|   35 | Stale remove preserves newer paths          | `PASS_LOCAL`                   |
|   36 | Full catalog image fields                   | `PASS_LOCAL / PASS_STAGING` |
|   37 | Replacement catalog delta                   | `PASS_LOCAL / PASS_STAGING` |
|   38 | Removal catalog delta                       | `PASS_LOCAL / PASS_STAGING` |
|   39 | Legacy additive compatibility               | `PASS_LOCAL`                   |
|   40 | Bounded 676-page drain                      | `PASS_LOCAL`                   |
|   41 | Catalog exactness                           | `PASS_LOCAL / PASS_STAGING` |
|   42 | Catalog image metadata redaction            | `PASS_LOCAL`                   |
|   43 | RLS grants and receipts                     | `PASS_LOCAL`                   |
|   44 | Canonical server-derived paths              | `PASS_LOCAL / PASS_STAGING` |
|   45 | Malformed route cold path                   | `PASS_LOCAL / PASS_STAGING` |
|   46 | TASK-147 catalog CPU regression             | `PASS_LOCAL / PASS_STAGING` |
|   47 | Image route emitted import graph            | `PASS_LOCAL`                   |
|   48 | Secret URL/audit/receipt redaction          | `PASS_LOCAL / PASS_STAGING` |

### Equivalenza CASE24 “zero image”

Il contratto read è volutamente bounded e richiede una ref completa
`productId/versionId/variant`; un prodotto mai fotografato non possiede quindi
un `versionId` da firmare. L’acceptance “zero image” è dimostrata in modo
composito:

- CASE36 verifica nel full/delta catalog la tri-state con campi immagine
  `null` per il prodotto never-imaged;
- lo step staging `catalog_without_image` verifica la stessa baseline live;
- CASE24 usa una ref di versione mancante/non firmabile e verifica `not_found`
  senza produrre alcuna signed URL.

Questa equivalenza non tratta una replacement esistente come never-imaged:
separa esplicitamente lo stato catalogo nullo dalla risposta read fail-closed.

## Guardrail applicati al gate staging

Il gate v2 `PASS` ha applicato i seguenti guardrail fail-closed:

- la resource gate non ha accettato artifact Cloudflare forniti dal
  chiamante;
- i marker CASE46/48 sono stati emessi solo dopo deployment status live,
  attestazione control-plane del Tail, Tail JSON filtrato per versione e run
  marker con copertura esatta delle sequenze `1..N`, full-drain esatto,
  GraphQL live, cleanup zero e recheck deployment;
- nessuna richiesta Worker ha preceduto il campione `cold_candidate`, che è
  rimasto la sequenza `1`; log, eccezioni e `diagnosticsChannelEvents` sono
  rimasti bounded e sono stati scansionati contro materiale segreto/URL;
- il self-test e la modalità offline non hanno potuto emettere CASE46/48;
- CASE40 è rimasto esclusivamente foundation: il marker staging non ha
  sovradichiarato un drain sintetico come prova delle 676 pagine;
- la vecchia signed URL è stata considerata scaduta solo con status esplicito
  `400/401/403/404/410`; errori rete, timeout e `429` hanno continuato a
  bloccare l’acceptance.

## Invarianti

- Signed URL, token, credential e request body in evidence: `0`.
- Production deploy: `NO`.
- Win7POS PR `#72` modificata: `NO`.
- Android/iOS modificati: `NO`.

## Delivery GitHub e staging

### Runtime

- PR non-draft:
  `#59 — feat: add trusted POS product image contract`.
- Feature SHA:
  `d7fe4eced2b8bcd015dd66b38baa30bc4619182f`.
- Required checks:
  `PASS`.
- Merge:
  `MERGED_NORMAL`, SHA
  `1de2912419f6770ff1ef7c6819754f4439ab849f`.

### Migration e deploy

- Migration staging:
  `APPLIED_ONCE`.
- Parity repository/staging:
  `97` righe, mismatch `0`.
- Repair/reset/revert:
  `0`.
- DB lint linked `public,app_private`, fail-on error:
  `PASS`, zero errori.
- Worker deploy TASK-149:
  `1/3`.
- Worker source:
  `1de2912419f6770ff1ef7c6819754f4439ab849f`.
- Digest SHA-256 redatto della versione al deploy:
  `39df9056b5c8c01bd6e5526bd03f1d936a619f2f52160b261b728062a1834817`.
- Production deploy/apply:
  `0`.

### Tooling Tail

- PR non-draft:
  `#60 — test: harden TASK-149 live Tail readiness`.
- Feature SHA:
  `a3347120d8686afe24c68ed9c1318f2c3e9647eb`.
- Required checks:
  `PASS`.
- Merge:
  `MERGED_NORMAL`, SHA
  `d3c674ada8aa7abf0179355c09238472b9ff3023`.
- Worker runtime delta:
  `0`.
- Deploy Worker dopo PR `#60`:
  `0`.

## Primo live gate: blocker fail-closed

Outcome:

`BLOCKED_TASK149_TAIL_COVERAGE_INCOMPLETE`

Il gate non è stato promosso a PASS. La readiness era stata attestata su un
processo `wrangler tail --format pretty` separato; quel processo era chiuso
prima dell'avvio del Tail JSON e un delay cieco di due secondi non provava
l'open/pong del WebSocket operativo. La sequenza iniziale può quindi essere
stata persa. Non viene pubblicato né inferito alcun conteggio Tail osservato.

### Recheck indipendente count-only del primo run

```json
{
  "status": "PASS",
  "candidateRunGroups": 1,
  "authActors": 2,
  "cleanupAuditRows": 1,
  "archivedShops": 1,
  "activeActorRows": 0,
  "activeAuthActors": 0,
  "residuals": {
    "products": 0,
    "imageVersions": 0,
    "receipts": 0,
    "catalogEvents": 0,
    "writeBudgetRows": 0,
    "storageObjects": 0
  },
  "auditRowsPreserved": 11,
  "forbiddenAuditMatches": 0,
  "cleanupDeleted": {
    "products": 1,
    "receipts": 8,
    "sync_events": 4,
    "image_versions": 3,
    "write_budget_rows": 2
  }
}
```

Il recheck non contiene raw marker, UUID, Auth ID, URL, path Storage o
credenziali e dimostra soltanto il cleanup del primo run.

## Remediation e regressione tooling

La PR `#60` sostituisce la readiness separata con sessione Tail control-plane
diretta e bounded, filtri esatti run/versione senza sampling, WebSocket
`trace-v1`, open e pong effettivi prima dell'harness, heartbeat per la request
phase, delete exactly-once e teardown bounded. Il child harness supporta
abort cooperativo e guarded `finally`; gli errori Tail non possono bypassare
la validazione dell'output e del cleanup child.

Gate reali post-fix:

- syntax gate/harness:
  `PASS`;
- resource gate self-test, incluso lifecycle fail-closed:
  `PASS`;
- subprocess cooperative-abort self-test:
  `PASS_SELF_TEST_NO_LIVE_EVIDENCE`;
- focused TASK-149:
  `28/28 PASS`;
- foundation completa con Win7POS pinned a
  `f34308b24fd30d0b85845429f1ece97cc5106c6d`:
  `PASS`;
- lint, typecheck, security, verify, `cf:build`, bundle graph e Worker smoke:
  `PASS`;
- Gitleaks changed files/staged diff:
  zero finding;
- review finale indipendente:
  `P0/P1/P2/P3 = 0/0/0/0`.

Un tentativo foundation precedente non pinned aveva selezionato un
clone/ambiente Win7POS esterno incompleto e falliva cinque check esterni.
L'outcome è `NOT_VALID_ENVIRONMENT`: non è usato come PASS, non è una
regressione TASK-149 e non sostituisce il rerun authoritative pinned verde.

## Secondo live gate e closeout

Outcome redatto:

`PASS`, schema `task149-pos-product-image-resource-gate-v2`.

- marker finali: `TASK149_CASE_46`, `TASK149_CASE_48` (`2/2`);
- acceptance step e marker harness: `19/19 PASS`;
- deployment digest SHA-256:
  `abdb4d35a8e0013eb4a431d2eb265472ea24412f33eb0a72bf2e8aa3998c6f51`;
- run marker digest SHA-256:
  `e6086bf1108733017cc7ad2206959c29e0a2434f8561dbc739e790a89868b27c`;
- Tail coverage digest SHA-256:
  `1cc5c22235d39be88c8bf1c2362a0de6b73b5beb0216df05d59e440774820590`;
- version digest SHA-256:
  `39df9056b5c8c01bd6e5526bd03f1d936a619f2f52160b261b728062a1834817`;
- eventi Tail correlati / richieste GraphQL: `34/34`;
- invocazioni cold / warm / full-drain: `1/32/1`;
- log records / diagnostics channel events: `13/0`;
- errori, eccezioni, forbidden log e forbidden diagnostic match: `0/0/0/0`;
- Tail CPU µs overall:
  `p50 10000`, `p90 38000`, `p99/p999/max 368000`;
- Tail CPU µs cold: `368000`;
- Tail CPU µs warm:
  `p50 9000`, `p90 18000`, `p99/p999/max 319000`;
- Tail CPU µs full-drain: `16000`;
- GraphQL CPU µs:
  `p50 10964`, `p90 38219`, `p99/p999/max 368575`;
- GraphQL memory bytes:
  `p50 32224684`, `p90 36520496`, `p99/p999 37648956`,
  `max 37648957`;
- versione attiva: `100%`;
- deployment/version invariati durante il gate.

Promozione staging verificata:
`01, 06, 07, 08, 12, 14, 21, 23, 25, 29, 31, 33, 34, 36, 37, 38, 41, 44,
45, 46, 48 = PASS_STAGING`.

### Recheck cleanup finale

`PASS`, recheck indipendente exact-scope e count-only.

- run marker digest SHA-256:
  `e6086bf1108733017cc7ad2206959c29e0a2434f8561dbc739e790a89868b27c`;
- candidate run groups / shop archiviati: `1/1`;
- attori Auth totali / inattivi / attivi: `2/2/0`;
- righe attore attive: `0`;
- residui image versions / products / receipts / sync events / Storage objects /
  write-budget rows: `0/0/0/0/0/0`;
- cleanup RPC verificata / cleanup audit rows: `1/1`;
- audit rows preservate / forbidden audit match: `11/0`;
- eliminati sync events / receipts / image versions / products /
  write-budget rows: `4/8/3/1/2`.

### Recheck deployment/source/version

`PASS`, recheck indipendente source/deployment/version.

- Worker source:
  `1de2912419f6770ff1ef7c6819754f4439ab849f`;
- deployment digest SHA-256:
  `abdb4d35a8e0013eb4a431d2eb265472ea24412f33eb0a72bf2e8aa3998c6f51`;
- version digest SHA-256:
  `39df9056b5c8c01bd6e5526bd03f1d936a619f2f52160b261b728062a1834817`;
- versione attiva: `100%`;
- deployment/version invariati durante il gate e nel recheck indipendente;
- deploy Worker dopo PR `#60`: `0`;
- production: `NOT_MODIFIED`.

## Validazione del closeout documentale

Il primo rerun della foundation dopo il freeze documentale è terminato
`FAIL`, senza essere promosso a evidence positiva: due test di governance
storici richiedevano i marker canonici `Stato task` ed
`Evidence task corrente`. Il fix ha modificato soltanto il Master Plan,
ripristinando `Stato task: REVIEW` ed
`Evidence task corrente: NESSUNO`; non ha cambiato runtime, handoff o prompt.

Rerun e check finali realmente eseguiti:

- foundation completa con Win7POS pinned a
  `f34308b24fd30d0b85845429f1ece97cc5106c6d`:
  `PASS`;
- lint:
  `PASS`;
- typecheck con route type generation:
  `PASS`;
- security scan:
  `PASS`;
- `npm run verify`, incluso build Next.js `16.2.6`:
  `PASS`;
- `npm run cf:build`, OpenNext Cloudflare `1.19.11`:
  `PASS`;
- POS Worker bundle graph:
  `PASS`, `7/7`;
- Cloudflare local smoke:
  `PASS`, incluse le quattro route POS immagini con light guard `400`,
  method guard `405`, header di sicurezza e `no-store`;
- `git diff --check`:
  `PASS`;
- Gitleaks sull'albero `docs`:
  `PASS`, zero finding;
- scanner semantico finale:
  `PASS`, sette file esatti, zero placeholder, stati TASK-149/TASK-150
  coerenti e `21` casi `PASS_STAGING`;
- review indipendente finale:
  `P0/P1/P2/P3 = 0/0/0/0`.

## Handoff finale

- Win7POS handoff:
  `docs/HANDOFFS/WIN7POS_POS_PRODUCT_IMAGE_V1_READY.md`.
- SHA-256 handoff Win7POS:
  `605d400b0074166991c185b0120aea78bc3a2924c447e7112796f680c88d7d87`.
- Prompt Asus Phase B:
  `docs/HANDOFFS/NEXT-CODEX-ASUS-PRODUCT-IMAGE-PHASE-B.md`.
- SHA-256 prompt Asus:
  `f74c569bdba14259a1d7361189b4a6e987919e025c0ca4d97d78e30ec3466b8d`.
- TASK-150:
  `DRAFT / PLANNING / NOT_ACTIVE`.
- Risoluzione TASK-149:
  `READY_FOR_ASUS_PRODUCT_IMAGE_PHASE_B`.
- Stato TASK-149:
  `REVIEW_READY / REVIEW`, mai `DONE`.
- Merge documentale finale:
  da attestare soltanto nel record GitHub/CI e nella risposta finale; nessun
  SHA auto-referenziale nel documento versionato.
- Production, Win7POS PR `#72`, Android e iOS:
  `NOT_MODIFIED`.
