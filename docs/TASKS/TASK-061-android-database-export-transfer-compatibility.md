# TASK-061 - Android database export compatibility for Admin Web database transfer

## Informazioni generali

- ID: `TASK-061`
- Titolo: `Android database export compatibility for Admin Web database transfer`
- Stato: `DONE`
- Fase attuale: `DONE_RECONCILED`
- Responsabile attuale: `NONE`
- Verdict tecnico: `DONE`
- Data apertura: `2026-06-14`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-061/README.md`
- Branch: `codex/task-061-android-database-export`

## Contesto

La schermata interessata e `Shop Admin Console > Catalog > Products >
Database transfer`. Il flusso Admin Web ha gia un import/export catalogo
server-side e shop-scoped, ma il workbook esportato dalla versione Android
deve essere riconosciuto e gestito come database export multi-entita, non come
semplice product import con mapping generico.

Il repository Android e fonte read-only per il formato export:
`/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView`.

## Scope

- Riconoscere automaticamente un workbook Android database export completo o
  parziale.
- Supportare i sheet tecnici Android:
  - `Products`
  - `Suppliers`
  - `Categories`
  - `PriceHistory`
- Validare parser e preview per tutti gli sheet importabili.
- Mostrare nella UI database transfer un riepilogo multi-sheet chiaro, bounded
  e non product-only.
- Importare in modo sicuro i dati supportati dal backend/schema reale.
- Gestire `PriceHistory` esplicitamente tramite parser, validation, preview e
  import RPC esistente se i riferimenti prodotto sono risolvibili.
- Preservare import prodotti/supplier esistente e boundary shop-scoped.
- Documentare il formato Android auditato dal codice Android.

## Non incluso

- Nessun commit, push o stage finale.
- Nessuna modifica al repository Android.
- Nessuna migration/schema/RLS/RPC nuova se il supporto reale esiste gia.
- Nessuna nuova dipendenza.
- Nessun workbook reale committato o copiato nel repository.
- Nessun dato reale, secret, token, password, PIN o service-role key nel client.
- Nessun modello `merchant/store`.
- Nessuna dashboard finta o POS/Staff separato.

## Fonti obbligatorie lette

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-060-supplier-excel-android-style-preview-import.md`
- `docs/TASKS/EVIDENCE/TASK-060/README.md`
- `package.json`
- Guide Next locali:
  - `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
  - `node_modules/next/dist/docs/01-app/02-guides/data-security.md`
- Codice Admin Web import/export Shop Admin indicato in evidence.
- Codice Android export indicato in evidence.

## Review cleanup 2026-06-14

- Richiesta: continuare `TASK-061` in `REVIEW`, senza aprire nuovo task e senza
  commit/push/stage finale.
- Root cause validazione: il workbook reale Android
  `/Users/minxiang/Downloads/Database_2026_06_04_19-09-08.xlsx` veniva bloccato
  dalla validazione Admin Web `8-14 digits` sui barcode prodotto. Il codice
  Android e il bulk RPC Admin Web accettano invece barcode testuali non vuoti;
  il fix allinea il database transfer Android a `non-empty <= 96 chars`,
  lasciando il vincolo `8-14 digits` al flusso supplier/generico.
- Root cause UX: la preview `validation_failed` restava mostrabile, ma la UI
  mostrava il messaggio generico rosso e non esponeva subito le righe bloccanti
  nello step di controllo workbook.
- Safety note: i testi che iniziano con `=`, `+`, `-`, `@`, tab o carriage
  return restano protetti in preview/export spreadsheet, ma sono separati da
  `rowWarnings` come `safetyNotes` e non bloccano apply.
- UX cleanup: modal database `size="wide"` con Back e file badge in titlebar,
  labels `Workbook / Check workbook / Review import`, mapping Android automatico
  con override sotto `Advanced mapping`, Step 3 database con summary
  Products/Suppliers/Categories/PriceHistory e split purchase/retail.
- Layout overflow cleanup: la modal database usa larghezza controllata,
  header sticky, body con scroll verticale unico e `overflow-x-hidden`; Step 2
  evita summary ridondanti, wrappa banner/chip/card e collassa warning/safety;
  Step 3 mostra summary e sezioni collassabili, nasconde di default le righe
  prodotto dettagliate dietro `Show detailed product rows` con massimo `20`
  righe visibili, e rimuove il Back ridondante nel footer.

## Critical fix / reconciliation attempt 2026-06-14

- Root cause apply/idempotenza: la preview database era legata a un
  `catalogScope` mutabile e il read model paginava su colonne non stabili in
  presenza di timestamp uguali; al retry il workbook completo poteva essere
  riclassificato come parzialmente nuovo. Il digest ora e shop-bound e il read
  model usa ordinamenti secondari stabili.
- Root cause partial failures: il path RPC/bulk non controllava sempre payload
  JSON `ok:false`, quindi alcune failure potevano emergere come errore
  generico o non invalidare la preview stale.
- Refactor security-safe: i bulk write staff-aware di prodotti e PriceHistory
  sono stati spostati fuori da `import-export-workbook.ts` e dentro
  `staff-aware-mutations.ts`, dietro `resolveInventoryOwner`. Il file workbook
  prepara payload/preview e delega il write staff-aware al boundary server-only.
- UX import: durante apply la UI mostra `Importing database...`, `aria-busy`,
  conferma/input/bottoni e close modal disabilitati; gli errori database usano
  messaggi specifici (`preview_mismatch`, `db_failure`, `partial_failure`) e
  cancellano la preview stale quando serve.
- E2E reale locale con
  `/Users/minxiang/Downloads/Database_2026_06_04_19-09-08.xlsx`: primo apply
  HTTP 200 con `21181` products, `59` suppliers, `24` categories, `44295`
  PriceHistory e `failedRows=0`; retry preview `newProducts=0`, retry apply
  HTTP 200, `failedRows=0`, conteggi DB invariati.
- Gate bloccante precedente risolto nel closure loop: i `27` failure
  foundation erano asserzioni statiche obsolete dopo i18n/layout e sono stati
  riallineati a dizionari/localized sections senza indebolire i controlli.

## DONE closure loop 2026-06-15

- Root cause foundation: test storici verificavano copy hardcoded in JSX
  (`Logout`, `Shop safety`, filtri, login Master/Admin, row details) mentre il
  codice ora usa dictionary/labels/localizedSection. Le asserzioni sono state
  aggiornate a verificare il contratto i18n e i valori dictionary, non stringhe
  duplicate nel componente.
- Subagent triage: `Foundation Failure Triage Agent` ha classificato i `27`
  failure come mismatch statici obsoleti e non regressioni database transfer.
  Ulteriori subagent non sono stati avviabili per limite thread raggiunto; il
  fix e la verifica sono stati completati nel main agent.
- E2E reale rieseguito dopo il refactor e dopo foundation verde con
  `/Users/minxiang/Downloads/Database_2026_06_04_19-09-08.xlsx`, senza copiare
  il workbook nel repo. Browser laterale usato per login/modal visibile; il
  caricamento file reale e stato eseguito in browser Playwright headed visibile
  per disponibilita di `setInputFiles`.
- Primo apply completo PASS: preview `newProducts=21181`, apply HTTP `200`,
  `failedRows=0`, DB Products `21181`, Suppliers `59`, Categories `24`,
  PriceHistory `44295`.
- Retry/idempotenza PASS: preview `newProducts=0`, apply HTTP `200`,
  `failedRows=0`, conteggi DB invariati. Cleanup locale sintetico `TASK061_*`
  completato con i quattro conteggi riportati a `0`.
- Gate finali seriali PASS: TASK-061 targeted, TASK-060 targeted,
  `npm run test:foundation` (`308/308`), `npm run typecheck`,
  `npm run lint`, `npm run security:scan`, `npm run build`, `npm run verify`,
  `git diff --check`.

## Criteri di accettazione

| CA | Descrizione | Tipo verifica | Stato |
|---|---|---|---|
| CA-01 | Governance TASK-061 riconciliata a `DONE` / `DONE_RECONCILED` dopo gate finali. | documentale | `PASS` |
| CA-02 | Formato Android export auditato da codice Android e documentato in `docs/specs/android-database-export-format.md`. | documentale/statico | `PASS` |
| CA-03 | Detection esplicita distingue Android database export da import prodotto generico e supporta workbook parziali. | test/statico | `PASS` |
| CA-04 | Parser/validation separati per `Products`, `Suppliers`, `Categories`, `PriceHistory`, con preview bounded e row counts. | test/statico | `PASS` |
| CA-05 | UI database transfer mostra riconoscimento Android, sheet summary e preview multi-sheet senza sembrare solo product mapping. | test/statico/browser se disponibile | `PASS_WITH_NOTES` |
| CA-06 | Import confermato applica suppliers, categories, products e PriceHistory tramite backend reale, shop-scoped e preview-first. | test/statico | `PASS` |
| CA-07 | `PriceHistory` non viene ignorato: type/timestamp/newPrice/source/productBarcode sono validati e importati tramite RPC reale o bloccati con errore esplicito. | test/statico | `PASS` |
| CA-08 | Export parziali Android (`Products`, `Suppliers`, `Categories`, `PriceHistory`) non crashano e mostrano stato importabile/bloccato corretto. | test/statico | `PASS_WITH_NOTES` |
| CA-09 | Import prodotti/supplier esistente non regredisce. | test | `PASS` |
| CA-10 | Check reali documentati con esito `PASS`, `PASS_WITH_NOTES`, `FAIL`, `BLOCKED` o `NOT_RUN`. | evidence | `PASS` |

## Matrice CA -> evidence

| CA | Comando/Metodo previsto | Esito ammesso | Evidence prevista |
|---|---|---|---|
| CA-01 | Lettura file governance + `git status` | `PASS` | `docs/TASKS/EVIDENCE/TASK-061/README.md` |
| CA-02 | Audit Android read-only | `PASS` / `BLOCKED` | spec formato Android + file Android letti |
| CA-03 | `node --test tests/foundation/task-061-*.test.mjs` | `PASS` | test detection |
| CA-04 | `node --test tests/foundation/task-061-*.test.mjs` | `PASS` | test parser/validation |
| CA-05 | test statico e browser se eseguibile | `PASS` / `NOT_RUN` | evidence UI |
| CA-06 | test statico/import contract | `PASS` | evidence apply |
| CA-07 | test PriceHistory | `PASS` | evidence PriceHistory |
| CA-08 | test fixture parziali | `PASS` | evidence partial exports |
| CA-09 | TASK-060/TASK-015 targeted | `PASS` | evidence regression |
| CA-10 | check finali repo | `PASS` / `PASS_WITH_WARNINGS` / `FAIL` | tabella check |

## Matrice test/check

| Test | Tipo | Stato |
|---|---|---|
| `node --test tests/foundation/task-061-android-database-export-transfer.test.mjs` | targeted | `PASS` |
| `node --test tests/foundation/task-060-supplier-excel-android-style-preview-import.test.mjs` | regressione supplier | `PASS` |
| `node --test tests/foundation/task-057-shop-catalog-workspace-import-intelligence.test.mjs` | regressione storica UI | `PASS` |
| `npm run test:foundation` | regressione foundation completa | `PASS` |
| `npm run security:scan` | sicurezza | `PASS` |
| `npm run typecheck` | TypeScript/Next typegen | `PASS` |
| `npm run lint` | lint | `PASS` |
| `npm run build` | build | `PASS_WITH_WARNINGS` |
| `npm run verify` | gate aggregato | `PASS_WITH_WARNINGS` |
| E2E reale browser locale con workbook Downloads | preview/apply/retry/idempotenza | `PASS` |
| `git diff --check` | whitespace | `PASS` |
| `git status --short --branch --untracked-files=all` | stato finale | `PASS_WITH_NOTES` |

## Execution

- File controllati:
  - `src/server/shop-admin/import-export-workbook.ts`
  - `src/server/shop-admin/catalog-import-contract.ts`
  - `src/server/shop-admin/action-context.ts`
  - `src/app/shop/_components/ImportExportActionPanel.tsx`
  - `src/app/shop/import-export/preview/route.ts`
  - `src/app/shop/import-export/apply/route.ts`
  - `src/server/shop-admin/import-export-readiness.ts`
  - `supabase/migrations/20260612015644_task_057_shop_scoped_mobile_history.sql`
  - `src/lib/supabase/database.types.ts`
- File toccati:
  - `docs/MASTER-PLAN.md`
  - `docs/TASKS/TASK-061-android-database-export-transfer-compatibility.md`
  - `docs/TASKS/EVIDENCE/TASK-061/README.md`
  - `docs/specs/android-database-export-format.md`
  - `src/app/shop/_components/CatalogActionPanel.tsx`
  - `src/server/shop-admin/import-export-workbook.ts`
  - `src/server/shop-admin/staff-aware-mutations.ts`
  - `src/server/shop-admin/inventory-read-model.ts`
  - `src/server/shop-admin/catalog-import-contract.ts`
  - `src/server/shop-admin/action-context.ts`
  - `src/app/shop/_components/ImportExportActionPanel.tsx`
  - `tests/foundation/task-032-excel-hardening.test.mjs`
  - `tests/foundation/task-057-shop-catalog-workspace-import-intelligence.test.mjs`
  - `tests/foundation/task-061-android-database-export-transfer.test.mjs`
  - `tests/foundation/task-060-supplier-excel-android-style-preview-import.test.mjs`
- Modifiche fatte: fix critico applicato; riconciliazione `DONE` eseguita.
- Check eseguiti: vedere evidence.
- Rischi rimasti: warning build/tooling preesistenti su `middleware`
  deprecato e `[DEP0205] module.register()`; non sono stati affrontati perche
  fuori scope. Nessun blocker applicativo residuo per TASK-061.
- Handoff: `DONE`.

## Review

- Decisione: `DONE`.
- Evidence verificata: `docs/TASKS/EVIDENCE/TASK-061/README.md`.
- Problemi review finale:
  - `RESOLVED`: preview UI di export parziale `PriceHistory` con
    `validation_failed` e senza righe prodotto ora resta mostrabile tramite
    `isPreviewableValidationFailure`.
  - `RESOLVED`: evidence aggiornata con check finali reali e stato `REVIEW`.
  - `RESOLVED`: workbook Android reale non bloccato da barcode non EAN; la
    diagnostica locale sul file reale mostra `androidBarcodeValidationFailures:
    0` e `oldEightToFourteenDigitFailures: 25`.
  - `RESOLVED`: modal Database transfer larga e allineata allo schema supplier,
    con Back/file badge in header e senza wrapper `Advanced...` ridondanti.
  - `RESOLVED`: safety sanitization separata da warning operativi e non
    bloccante.
  - `RESOLVED`: bulk write staff-aware spostato nel boundary
    `staff-aware-mutations.ts`, con `security:scan` PASS.
  - `RESOLVED`: E2E reale completo con workbook Downloads, primo apply e
    retry/idempotenza PASS con conteggi DB invariati.
- Problemi residui: nessun blocker TASK-061. Restano solo warning tooling
  preesistenti documentati in evidence.
- Condizioni per passare a `DONE`: soddisfatte nel closure loop 2026-06-15.
