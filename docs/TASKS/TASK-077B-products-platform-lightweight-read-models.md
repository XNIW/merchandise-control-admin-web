# TASK-077B - Performance architecture fix: Products + Master Console lightweight read models

## Informazioni generali

- ID: `TASK-077B`
- Titolo: `Performance architecture fix: Products + Master Console lightweight read models`
- Stato: `DONE_RECONCILED`
- Fase attuale: `DONE_RECONCILED`
- Parent task: `TASK-077 - Admin Console real-shop performance hardening`
- Data apertura: `2026-06-20`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-077B/README.md`

## Contesto

Prima di questo fix, `TASK-077` e `TASK-077A` non erano `DONE`. Products era il
blocker principale della Shop Admin Console: il feedback visivo era buono, ma
il final marker real-shop/local-cloud era ancora sopra soglia. `TASK-077A` ha
misurato la Master Console: pending buono, ma Users, Shop Admins, Admins e
Shops superavano 2.8s perche usavano il read model Platform globale con Auth
identities e mobile
inventory counts.

## Scope

- Misurare Products con `ADMIN_WEB_PERF_DEBUG=1`, report redatto e payload
  approssimativo quando disponibile.
- Confermare il collo di bottiglia Products tra query Supabase, count exact,
  `buildProductsPageSection`, `ShopSectionPage`, payload/RSC e bundle client.
- Rendere Products realmente leggero al primo paint:
  - header;
  - filtri;
  - paginazione;
  - prime righe necessarie;
  - toolbar light;
  - dialog/panel solo quando `product_action` e presente;
  - detail/price history/options pesanti lazy o on-demand.
- Creare read model Platform leggeri:
  - `getPlatformOverviewReadModel`
  - `getPlatformUsersReadModel`
  - `getPlatformShopAdminsReadModel`
  - `getPlatformAdminsReadModel`
  - `getPlatformShopsReadModel`
  - `getPlatformAuditReadModel`
  - `getPlatformSystemReadModel`
- Mantenere auth server-side, RLS, no service-role client/browser e nessun dato
  reale in evidence.
- Misurare Shop Admin e Master Console route-by-route dopo il fix.

## Non incluso

- Nessun audit generico oltre alle misure necessarie.
- Nessun fix solo cosmetico/skeleton come soluzione.
- Nessun commit, push o deploy senza conferma esplicita.
- Nessun production deploy o Supabase production apply.
- Nessun dato reale, email, shop id, shop code, nomi reali o secret in evidence.
- Nessuna modifica Android/iOS/POS o rottura dei contratti sync.

## Criteri di accettazione

| CA | Descrizione | Stato |
|---|---|---|
| CA-01 | Subtask/evidence aperti senza cambiare TASK-077 in `DONE`. | `PASS` |
| CA-02 | Products baseline real-shop/local-cloud con debug, query, payload e render timing. | `PASS` |
| CA-03 | Products sotto 2s finali real-shop/local-cloud o root cause precisa con numeri. | `PASS` |
| CA-04 | Platform route misurate con read model leggeri e query count per route. | `PASS` |
| CA-05 | Users/Admins/Shops/Shop Admins non caricano mobile counts nel primo paint. | `PASS` |
| CA-06 | Check richiesti eseguiti o motivati. | `PASS_WITH_WARNINGS` |

## Fonti lette

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-077-admin-console-real-shop-performance-hardening.md`
- `docs/TASKS/TASK-077A-master-console-performance-audit.md`
- `docs/TASKS/EVIDENCE/TASK-077/README.md`
- `docs/TASKS/EVIDENCE/TASK-077A/README.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
- `src/app/shop/products/page.tsx`
- `src/server/shop-admin/inventory-read-model.ts`
- `src/server/platform-admin/read-model.ts`
- `src/server/platform-admin/platform-section-data.ts`
- `scripts/testing/task-077-shop-cloud-performance.mjs`
- `scripts/testing/task-077a-platform-performance.mjs`

## Piano operativo

1. Aprire tracking/evidence e rendere il benchmark Products leggibile con trace
   server/payload.
2. Misurare Products before con Supabase cloud/staging env e app locale
   production-like.
3. Tagliare il path Products in base ai numeri, partendo da count exact,
   summary e render generico se confermati.
4. Introdurre read model Platform leggeri e instradare le route.
5. Eseguire benchmark after Shop e Platform.
6. Eseguire check richiesti e aggiornare evidence/verdict.

## Final review / DONE_RECONCILED handoff - 2026-06-20

Verdict: `DONE_RECONCILED`.

- Products real-shop/local-cloud passa dal trace before con `10` query e
  `serverTotalMsMax=2783.3ms`, `documentMs=2533ms` e `RSC=16413B` al trace
  after final reconciliation con `5` query, count `deferred`, 10 righe pagina,
  `serverTotalMsMax=1327.3ms` nel run Products-only e `1093.4ms` nel run
  Admin Console completa, `documentMs=885ms`/`820ms`, `finalMs=94ms`/`77ms`
  e sostituzione visiva entro `35ms`/`17ms`.
- Platform after con read model leggeri: `/platform`, `/platform/users`,
  `/platform/shop-admins`, `/platform/admins`, `/platform/shops`,
  `/platform/operations`, `/platform/audit` e `/platform/system` hanno final
  marker `819-860ms`. Users/Admins/Shops/Shop Admins non caricano mobile
  inventory counts nel primo paint; Users carica Auth identities solo sulla
  route Users.
- Fixture cloud/local-cloud dopo fix: Products `51ms` final marker, pending
  `15ms`, TTFB `448ms`; Categories `53ms`, Suppliers `54ms`, Staff `51ms`,
  History `46ms`, Sync `52ms`.
- Gate finali eseguiti: `git diff --check`, `npm run lint`,
  `npm run typecheck`, `npm run security:scan`, `npm run build`,
  `npm run verify`, `npm run test:foundation` (`414/414`), benchmark
  TASK-077 Products real-shop/fixture e benchmark TASK-077A Platform.
  Build/verify restano `PASS_WITH_WARNINGS` per warning preesistenti
  `middleware` deprecato e `[DEP0205]`.
- Produzione, deploy, Supabase apply, commit, push e stage: `NOT_RUN`.

## Stato corrente

`DONE_RECONCILED` dopo DONE Seal utente. Handoff tecnico verificato con
evidence e gate reali; resta fuori scope qualunque deploy/staging/production
readiness non eseguita.
