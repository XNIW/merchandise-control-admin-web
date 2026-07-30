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
- PR/CI/merge: `NOT_RUN`.
- Migration parity/apply staging: `NOT_RUN`.
- Deploy staging: `NOT_RUN`.
- Acceptance staging: `NOT_RUN`.
- Cleanup/residui: `NOT_RUN`.

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

`PASS_LOCAL` indica evidence foundation, pgTAP, security, bundle o smoke locale
già eseguita. `STAGING_PENDING` indica che il marker live aggiuntivo sarà
ammesso solo dal gate staging/Cloudflare reale dopo merge e deploy.

| Caso | Scenario                                    | Evidence pre-merge             |
| ---: | ------------------------------------------- | ------------------------------ |
|   01 | Valid session                               | `PASS_LOCAL / STAGING_PENDING` |
|   02 | Expired session                             | `PASS_LOCAL`                   |
|   03 | Revoked device                              | `PASS_LOCAL`                   |
|   04 | Wrong shop                                  | `PASS_LOCAL`                   |
|   05 | Read-only staff write denial                | `PASS_LOCAL`                   |
|   06 | Malformed envelope                          | `PASS_LOCAL / STAGING_PENDING` |
|   07 | Unknown app version policy                  | `PASS_LOCAL / STAGING_PENDING` |
|   08 | Valid replacement intent                    | `PASS_LOCAL / STAGING_PENDING` |
|   09 | Intent product not found                    | `PASS_LOCAL`                   |
|   10 | Intent expected-version conflict            | `PASS_LOCAL`                   |
|   11 | Invalid JPEG metadata                       | `PASS_LOCAL`                   |
|   12 | Intent replay same hash                     | `PASS_LOCAL / STAGING_PENDING` |
|   13 | Intent replay different hash                | `PASS_LOCAL`                   |
|   14 | Valid finalize                              | `PASS_LOCAL / STAGING_PENDING` |
|   15 | Finalize missing object                     | `PASS_LOCAL`                   |
|   16 | Finalize MIME mismatch                      | `PASS_LOCAL`                   |
|   17 | Finalize hash mismatch                      | `PASS_LOCAL`                   |
|   18 | Finalize byte mismatch                      | `PASS_LOCAL`                   |
|   19 | Finalize dimension mismatch                 | `PASS_LOCAL`                   |
|   20 | Finalize corrupt JPEG                       | `PASS_LOCAL`                   |
|   21 | Finalize replay                             | `PASS_LOCAL / STAGING_PENDING` |
|   22 | Failed finalize preserves current           | `PASS_LOCAL`                   |
|   23 | Finalize revision publication               | `PASS_LOCAL / STAGING_PENDING` |
|   24 | Zero/missing image resolves without signing | `PASS_LOCAL`                   |
|   25 | Read ready image                            | `PASS_LOCAL / STAGING_PENDING` |
|   26 | Read removed or superseded denial           | `PASS_LOCAL`                   |
|   27 | Read batch sixteen                          | `PASS_LOCAL`                   |
|   28 | Read batch seventeen rejected               | `PASS_LOCAL`                   |
|   29 | Signed URL bounded TTL and memory-only      | `PASS_LOCAL / STAGING_PENDING` |
|   30 | Signed URL absent from logs                 | `PASS_LOCAL`                   |
|   31 | Valid remove                                | `PASS_LOCAL / STAGING_PENDING` |
|   32 | Remove expected-version conflict            | `PASS_LOCAL`                   |
|   33 | Remove replay one-shot                      | `PASS_LOCAL / STAGING_PENDING` |
|   34 | Remove cleanup pending                      | `PASS_LOCAL / STAGING_PENDING` |
|   35 | Stale remove preserves newer paths          | `PASS_LOCAL`                   |
|   36 | Full catalog image fields                   | `PASS_LOCAL / STAGING_PENDING` |
|   37 | Replacement catalog delta                   | `PASS_LOCAL / STAGING_PENDING` |
|   38 | Removal catalog delta                       | `PASS_LOCAL / STAGING_PENDING` |
|   39 | Legacy additive compatibility               | `PASS_LOCAL`                   |
|   40 | Bounded 676-page drain                      | `PASS_LOCAL`                   |
|   41 | Catalog exactness                           | `PASS_LOCAL / STAGING_PENDING` |
|   42 | Catalog image metadata redaction            | `PASS_LOCAL`                   |
|   43 | RLS grants and receipts                     | `PASS_LOCAL`                   |
|   44 | Canonical server-derived paths              | `PASS_LOCAL / STAGING_PENDING` |
|   45 | Malformed route cold path                   | `PASS_LOCAL / STAGING_PENDING` |
|   46 | TASK-147 catalog CPU regression             | `PASS_LOCAL / STAGING_PENDING` |
|   47 | Image route emitted import graph            | `PASS_LOCAL`                   |
|   48 | Secret URL/audit/receipt redaction          | `PASS_LOCAL / STAGING_PENDING` |

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

## Gate staging ancora dovuti

- La resource gate non accetta artifact Cloudflare forniti dal chiamante.
- I marker CASE46/48 possono essere emessi solo dopo deployment status live,
  attestazione control-plane del tail, tail JSON filtrato per versione e run
  marker con copertura esatta delle sequenze `1..N`, full-drain esatto,
  GraphQL live, cleanup zero e recheck deployment.
- Nessuna richiesta Worker precede il campione `cold_candidate`; il gate
  richiede che sia la sequenza `1`. Log, eccezioni e
  `diagnosticsChannelEvents` sono bounded e scansionati contro materiale
  segreto/URL.
- Il self-test e la modalità offline non possono emettere CASE46/48.
- CASE40 resta esclusivamente foundation: il marker staging non può
  sovradichiarare un drain sintetico come prova delle 676 pagine.
- La vecchia signed URL è considerata scaduta solo con status esplicito
  `400/401/403/404/410`; errori rete, timeout e `429` bloccano l’acceptance.

## Invarianti

- Signed URL, token, credential e request body in evidence: `0`.
- Production deploy: `NO`.
- Win7POS PR `#72` modificata: `NO`.
- Android/iOS modificati: `NO`.
