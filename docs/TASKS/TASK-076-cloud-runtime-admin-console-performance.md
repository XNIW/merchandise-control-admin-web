# TASK-076 - Cloud Runtime Performance Fix: Admin Console tab latency

## Informazioni generali

- ID: `TASK-076`
- Titolo: `Cloud Runtime Performance Fix: Admin Console tab latency, Staff, Products and full Shop navigation`
- Stato: `DONE_RECONCILED_WITH_NOTES`
- Fase attuale: `DONE_RECONCILED`
- Responsabile attuale: `CODEX`
- Data apertura: `2026-06-19`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-076/README.md`

## Contesto

`TASK-075` ha ridotto parte del lavoro locale su Products, ma non ha validato
il runtime autenticato cloud. L'utente ha confermato che la Admin Console reale
resta lenta: `/shop/products` e `/shop/staff` richiedono circa o oltre due
secondi prima di mostrare contenuto utile.

TASK-076 deve misurare e correggere la latenza reale della Shop Admin Console
su target cloud/non-production, con focus su feedback immediato di navigazione,
Products, Staff e almeno cinque route Shop aggiuntive.

## Scope

- Baseline cloud/non-production autenticata per:
  - `/shop`
  - `/shop/products`
  - `/shop/staff`
  - `/shop/devices`
  - `/shop/history`
  - `/shop/sync`
  - `/shop/members`
  - `/shop/settings`
- Audit read model e query per Products, Staff, Devices, History, Members e Sync.
- Tracing server-only opt-in, eventualmente con metadata/header debug non
  persistenti e senza segreti.
- Pending/navigation feedback client-side immediato nella Shop sidebar.
- Loading skeleton route-specific per route pesanti.
- Ottimizzazioni piccole e misurabili su read model e pagine lente.
- Nuovo harness cloud performance autenticato, con fixture sintetica `TASK076_*`
  e cleanup verificabile.
- Review multipla: performance/data-access, UI navigation, security/regression,
  cloud authenticated E2E.

## Non incluso

- Nessun deploy production.
- Nessun Supabase production apply.
- Nessun dato reale permanente.
- Nessun secret/token/PIN/password/service-role nel client/browser/mobile o in
  evidence.
- Nessuna service-role key nel browser.
- Nessun grande refactor non misurato.
- Nessuna modifica Android/iOS/POS.
- Nessun commit, push o stage finale salvo richiesta esplicita successiva.

## Criteri di accettazione

| CA | Descrizione | Stato |
|---|---|---|
| CA-01 | Task/evidence aperti e Master Plan aggiornato a `EXECUTION`. | `PASS` |
| CA-02 | Baseline cloud autenticata con route-by-route table. | `PASS` |
| CA-03 | Root cause reale confermata e distinto dal limite di TASK-075. | `PASS` |
| CA-04 | Navigazione sidebar evidenzia tab/pending entro 200ms. | `PASS` |
| CA-05 | Skeleton/pending visibile entro 300ms sulle route critiche. | `PASS` |
| CA-06 | Products e Staff sotto 1.5s contenuto finale se cloud normale. | `PASS` |
| CA-07 | Almeno 5 route Shop aggiuntive misurate e senza tab >2s senza feedback. | `PASS_AFTER_TASK_077B` |
| CA-08 | Query/read model pesanti eliminati, differiti o motivati. | `PASS_AFTER_TASK_077B` |
| CA-09 | No secret leak, no service-role client, no cross-shop leak. | `PASS` |
| CA-10 | Cloud authenticated E2E e cleanup `TASK076_*` verificati. | `PASS` |
| CA-11 | Check richiesti eseguiti o marcati `NOT_RUN`/`BLOCKED` con motivo reale. | `PASS` |
| CA-12 | Evidence finale include before/after, Staff, Products, residui e stato. | `PASS` |

## Fonti lette

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-075-admin-web-performance-audit-products-latency.md`
- `docs/TASKS/EVIDENCE/TASK-075/README.md`
- `src/app/shop/layout.tsx`
- `src/components/shop/ShopShell.tsx`
- `src/app/shop/products/page.tsx`
- `src/app/shop/staff/page.tsx`
- `src/server/shop-admin/data-access.ts`
- `src/server/shop-admin/action-context.ts`
- `src/server/shop-admin/inventory-read-model.ts`
- `src/server/shop-admin/staff-read-model.ts`
- `src/server/shop-admin/shop-section-data.ts`
- `src/server/shop-admin/page-access.ts`
- `src/server/admin-web-perf.ts`
- `scripts/platform/cloud-dev-server.mjs`
- `scripts/platform/cloud-target-probe.mjs`
- `scripts/testing/run-playwright-target.mjs`
- `tests/e2e/task-035-shop-admin-authenticated-smoke.spec.ts`
- `tests/e2e/staging/platform-staging-smoke.spec.ts`
- `docs/DEPLOYMENT/STAGING.md`
- `docs/DEPLOYMENT/CLOUDFLARE-MIGRATION.md`
- `docs/DEVELOPMENT/SUPABASE-LOCAL-DEV.md`
- Guide Next locali:
  - `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`
  - `node_modules/next/dist/docs/01-app/02-guides/prefetching.md`
  - `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md`
  - `node_modules/next/dist/docs/01-app/02-guides/streaming.md`
  - `node_modules/next/dist/docs/01-app/02-guides/instant-navigation.md`
  - `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/index.md`
  - `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/instant.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
  - `node_modules/next/dist/docs/01-app/02-guides/data-security.md`

## Piano operativo

1. Preflight git e verifica che TASK-075 sia locale/non committato.
2. Misura baseline cloud/staging autenticata con fixture sintetica `TASK076_*`.
3. Aggiungi/estendi tracing opt-in e harness performance.
4. Correggi feedback immediato di navigazione nella Shop sidebar.
5. Aggiungi loading route-specific per Staff, Devices, History e Sync.
6. Ottimizza Products/Staff e route lente in modo piccolo e misurabile.
7. Riesegui cloud authenticated QA e cleanup.
8. Esegui scanner, foundation, typecheck, lint, build, verify e review.

## Matrice test/check prevista

| Check | Stato |
|---|---|
| `git status --short --branch --untracked-files=all` preflight | `PASS` |
| `git diff --check` preflight | `PASS` |
| Baseline cloud authenticated performance | `PASS` |
| `npm run test:shop:cloud-performance` | `PASS`, baseline e after con cleanup zero |
| `npm run security:scan` | `PASS` |
| Targeted foundation TASK-076/TASK-075/shell | `PASS`, 11/11 |
| `npm run typecheck` | `PASS` |
| `npm run lint` | `PASS` |
| `npm run build` | `PASS` |
| `npm run verify` | `PASS` |
| Browser cloud authenticated QA | `PASS_WITH_NOTES_HISTORY`, Cloudflare staging |
| `npm run cf:deploy:staging` | `PASS`, Version ID `d266644d-78e0-4ccd-8da2-0844ab91a175` |
| `git diff --check` finale | `PASS` |
| `git status --short --branch --untracked-files=all` finale | `PASS_WITH_NOTES_TASK075_LOCAL` |

## Final DONE reconciliation - 2026-06-20

Il residuo storico di `TASK-076` su `/shop/history` e stato verificato come
risolto dai fix `TASK-077`/`TASK-077B`:

- Admin Console real-shop/local-cloud:
  `docs/TASKS/EVIDENCE/TASK-077/task-077-cloud-performance-real-shop-task-077-final-reconciliation-shop.json`.
  `/shop/history` `finalMs=46ms`, `documentMs=440ms`, `visualReplacementMs=14ms`,
  nessun timeout.
- Fixture cloud/local-cloud:
  `docs/TASKS/EVIDENCE/TASK-077/task-077-cloud-performance-fixture-task-077-final-reconciliation-fixture.json`.
  `/shop/history` `finalMs=46ms`, pending `12ms`, nessun timeout.
- Products real-shop/local-cloud:
  `docs/TASKS/EVIDENCE/TASK-077/task-077-cloud-performance-real-shop-task-077-final-reconciliation-products.json`.
  `queryCount=5`, count exact rimosso dal first paint e total count differito.

Gate freschi: `security:scan`, `test:foundation` (`414/414`), `typecheck`,
`lint`, `build`, `verify`, `git diff --check`: `PASS` o
`PASS_WITH_WARNINGS` solo per warning build noti.

Commit, stage, push, deploy e Supabase apply: `NOT_RUN`.

## Stato corrente

`DONE_RECONCILED_WITH_NOTES`. Le note storiche del run staging TASK-076 restano
nel file per audit trail, ma il blocker History non e piu attivo nella evidence
finale local-cloud/read-only.
