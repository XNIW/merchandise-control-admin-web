# TASK-077 - Admin Console real-shop performance hardening

## Informazioni generali

- ID: `TASK-077`
- Titolo: `Admin Console real-shop performance hardening`
- Stato: `DONE_RECONCILED`
- Fase attuale: `DONE_RECONCILED`
- Responsabile attuale: `CODEX`
- Data apertura: `2026-06-20`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-077/README.md`

## Contesto

`TASK-075` e `TASK-076` hanno migliorato feedback e performance su fixture cloud
sintetica, ma `TASK-076` resta `REVIEW_WITH_NOTES`: `/shop/history` va ancora
in timeout nel click-flow cloud e il benchmark usa fixture `TASK076_*`, non
necessariamente lo shop reale dell'utente.

L'obiettivo di `TASK-077` e ottimizzare performance percepita e reale della Shop
Admin Console su dati cloud reali/read-only e fixture sintetica, senza production
deploy, senza dati finti nella modalita real-shop, senza service-role client e
senza rompere sync Android/iOS.

## Scope

- Aprire task/evidence e tracciare `TASK-077` nel Master Plan.
- Misurare cloud real-shop read-only e fixture sintetica.
- In `ShopShell`, sostituire il content frame con skeleton target durante
  `pendingNavigation`, senza renderizzare il vecchio `{children}` sotto il
  banner.
- Creare read model leggeri per `Categories` e `Suppliers`, evitando il full
  `getShopInventoryReadModel` nel primo render di quelle route.
- Creare `resolveStaffPageBundle` per Staff: staff rows e permessi in un unico
  boundary server-only.
- Ottimizzare `History` con lista light, evitando count exact e detail/diagnostics
  nel primo paint quando non indispensabili e riducendo fallback legacy nel path
  critico.
- Ottimizzare `Overview` separando card leggere da sezioni pesanti.
- Estendere performance harness per:
  - shop reale read-only;
  - fixture sintetica;
  - Products, Staff, History, Categories, Suppliers, Overview.

## Non incluso

- Nessun deploy production.
- Nessun Supabase production apply.
- Nessuna service-role key nel client/browser/mobile.
- Nessun dato reale, token, credenziale o password in log/evidence.
- Nessuna modifica Android/iOS/POS o rottura dei contratti sync.
- Nessuna console POS separata.
- Nessun `DONE` senza review/conferma utente e cloud real-shop evidence.

## Criteri di accettazione

| CA | Descrizione | Stato |
|---|---|---|
| CA-01 | Task/evidence aperti e Master Plan aggiornato a `EXECUTION`. | `PASS` |
| CA-02 | Baseline before su fixture sintetica e real-shop read-only eseguita o marcata `BLOCKED` con motivo reale. | `PASS_WITH_NOTES` |
| CA-03 | `ShopShell` sostituisce il vecchio contenuto con skeleton target durante navigazione pending. | `PASS` |
| CA-04 | Categories/Suppliers non usano il full inventory read model nel primo render. | `PASS` |
| CA-05 | Staff usa un bundle server-only unico per read model e permessi action. | `PASS` |
| CA-06 | History esce dal timeout cloud e primo paint usa lista light senza count exact obbligatorio. | `PASS` |
| CA-07 | Overview separa shell/card leggere da read model pesanti. | `PASS` |
| CA-08 | Harness copre real-shop read-only e fixture per Products, Staff, History, Categories, Suppliers, Overview. | `PASS_WITH_NOTES` |
| CA-09 | Nessuna scheda resta oltre 2s senza sostituzione visiva completa. | `PASS` |
| CA-10 | Security/foundation/typecheck/lint/build/verify/cloud after/git diff check eseguiti o motivati. | `PASS_WITH_WARNINGS` |
| CA-11 | Evidence finale include before/after real-shop, before/after fixture, fix espliciti e rischi residui. | `PASS_AFTER_TASK_077B` |

## Fonti lette

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-075-admin-web-performance-audit-products-latency.md`
- `docs/TASKS/TASK-076-cloud-runtime-admin-console-performance.md`
- `docs/TASKS/EVIDENCE/TASK-076/README.md`
- `docs/TASKS/EVIDENCE/TASK-076/task-076-cloud-performance-after.json`
- `src/components/shop/ShopShell.tsx`
- `src/app/shop/staff/page.tsx`
- `src/app/shop/categories/page.tsx`
- `src/app/shop/suppliers/page.tsx`
- `src/app/shop/history/page.tsx`
- `src/server/shop-admin/shop-section-data.ts`
- `src/server/shop-admin/history-read-model.ts`
- `src/server/shop-admin/staff-read-model.ts`
- `src/server/shop-admin/inventory-read-model.ts`
- Guide Next locali:
  - `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`
  - `node_modules/next/dist/docs/01-app/02-guides/prefetching.md`
  - `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md`
  - `node_modules/next/dist/docs/01-app/02-guides/streaming.md`
  - `node_modules/next/dist/docs/01-app/02-guides/instant-navigation.md`
  - `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/instant.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
  - `node_modules/next/dist/docs/01-app/02-guides/data-security.md`
  - `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/index.md`

## Piano operativo

1. Aprire tracking/evidence e misurare baseline before.
2. Aggiornare `ShopShell` con skeleton target e test strutturale.
3. Introdurre read model leggeri Categories/Suppliers e Staff bundle.
4. Ottimizzare History list light e Overview progressiva.
5. Estendere harness cloud performance per fixture e real-shop read-only.
6. Eseguire check richiesti e aggiornare evidence/handoff.

## Risultato

- Fixture before cloud: `/shop/history` in `timeout`; le altre route erano
  `ready` con pending osservato.
- Real-shop read-only final-review local-cloud: eseguito su shop reale
  autorizzato e report redatti senza id/code/email/nomi reali. `History` passa
  a `842ms`, `Staff` a `849ms`, `Sync` a `841ms`; `Products` resta sopra soglia
  con final marker `4419ms`.
- Git/deploy final-review: TASK-077 non e presente in `HEAD`/`main`, non e
  committato/pushato e lo staging verificato non contiene TASK-077.
- Fixture after su app locale TASK-077 + Supabase cloud: Overview, Products,
  Categories, Suppliers, Staff e History hanno sostituzione visiva completa
  entro `40-69ms`; `/shop/history` passa da `timeout` a `1425ms`.
- Products fixture after resta sopra 2s come final marker (`2470ms`), e
  Products real-shop resta sopra 2s (`4419ms`), quindi il gate finale non puo
  diventare `DONE_READY`.

## Final TASK-077B handoff - 2026-06-20

`TASK-077B` supera il blocker Products e il blocker Master Console con evidence
local-cloud/read-only redatta:

- Products real-shop after leggero: run Products-only
  `documentMs=885ms`, `finalMs=94ms`, `visualReplacementMs=35ms`,
  `queryCount=5`, `serverTotalMsMax=1327.3ms`; run Admin Console completa
  `documentMs=820ms`, `finalMs=77ms`, `visualReplacementMs=17ms`,
  `queryCount=5`, `serverTotalMsMax=1093.4ms`.
- Platform after read model leggeri: tutte le route misurate hanno final marker
  `819-860ms`; Shop Admins/Admins/Shops non caricano piu mobile inventory
  counts nel primo paint.
- Fixture after final reconciliation: Products `51ms`, Categories `53ms`,
  Suppliers `54ms`, Staff `51ms`, History `46ms`, Sync `52ms`.
- Staging/deploy/commit/push/stage restano `NOT_RUN`; questo verdict chiude il
  lavoro locale verificato, non dichiara deploy readiness e non marca `DONE`.

## Check

- `npm run security:scan`: `PASS`
- `npm run test:foundation`: `PASS`, `409/409`
- `npm run typecheck`: `PASS`
- `npm run lint`: `PASS`
- `npm run build`: `PASS_WITH_WARNINGS`, warning preesistenti su `middleware`
  deprecato e `[DEP0205]`
- `npm run verify`: `PASS_WITH_WARNINGS`, stessi warning build
- `git diff --check`: `PASS`

## Stato corrente

`DONE_RECONCILED` dopo `TASK-077B` e DONE Seal utente. Nessun commit, push,
stage, deploy staging/production o Supabase apply eseguito.
