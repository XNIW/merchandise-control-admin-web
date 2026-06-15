# Evidence TASK-061

Verdict corrente: `DONE`.

TASK-061 e riconciliato a `DONE` per rendere il database transfer Admin Web compatibile
con i workbook database esportati da Android. Questo file raccoglie solo
evidence redatta e risultati di comandi eseguiti davvero. Nessun workbook reale
e stato copiato o committato nel repository.

## Apertura 2026-06-14

- Branch corrente creato prima delle modifiche codice:
  `codex/task-061-android-database-export`.
- `git branch --show-current`: `main` prima del branch; poi branch dedicato.
- `git status --short` iniziale prima del branch:
  `M docs/TASKS/EVIDENCE/TASK-035/browser-shop-overview-authenticated.png`.
- Worktree gia dirty prima di TASK-061 per screenshot evidence TASK-035; non
  revertito perche non collegato allo scope.
- TASK-060 risulta gia chiuso a `DONE`; numero task corretto: `TASK-061`.
- Task attivo precedente nel Master Plan: `NESSUNO`.
- Commit/push/stage: non eseguiti.

## Subagenti

Richiesta utente: usare orchestratore e subagenti. Tool multi-agent disponibile
e usato davvero:

- `Android Export Auditor` (`019ec848-52a6-7931-91dc-82e62daf9d22`):
  audit read-only repository Android. Esito: formato export confermato con
  sheet tecnici `Products`, `Suppliers`, `Categories`, `PriceHistory`, header
  localizzati per prodotti, `PriceHistory` con `productBarcode`, `timestamp`,
  `type`, `oldPrice`, `newPrice`, `source`.
- `Repo & Governance Auditor + Admin Import Auditor`
  (`019ec848-70a7-7fc1-9fe5-ca11377681de`): audit read-only Admin Web.
  Esito: flusso esistente `supplier`/`database`, route preview/apply
  server-side e UI da estendere senza duplicare pipeline.
- `Domain Mapping / Price History / Security Guardrail Auditor`
  (`019ec848-8ab6-7ae3-8274-734361b7d7aa`): audit read-only schema/RPC.
  Esito: `inventory_product_prices` e RPC
  `shop_catalog_import_price_history` esistono e sono shop-scoped; nessuna
  migration/RPC nuova necessaria.
- `Final Reviewer` (`019ec857-e6b2-7242-ba5b-b63375931c4a`): review read-only
  del diff. Ha trovato due finding major: preview UI dei `PriceHistory`
  parziali bloccati non mantenuta e evidence incompleta. Il primo e stato
  corretto con `isPreviewableValidationFailure`; il secondo e corretto da
  questo aggiornamento evidence.
- Review cleanup 2026-06-14:
  - `Android Export Validation Auditor`
    (`019ec87d-6ac7-71c0-8b8f-91477faf1a53`): ha confermato che il workbook
    reale Android completo e valido veniva bloccato da `Barcode must contain 8
    to 14 digits.`; Android salva barcode come `String` e il bulk RPC Admin Web
    accetta testo fino a 96 caratteri.
  - `Database Transfer UI Auditor`
    (`019ec87d-80e9-7ee1-b196-cc093eb5f7f7`): ha segnalato modal stretta,
    header non allineato alla supplier modal, mapping gigante nello step 2 e
    wrapper `Advanced...` ridondanti.
  - `Parser/Warning Classification Auditor`
    (`019ec87d-9e78-7961-9b0e-19323cac84ba`): ha richiesto separazione tra
    errori bloccanti, warning operativi e safety sanitization; ha segnalato
    anche la decorazione righe prodotto per solo `rowNumber`.
  - `Security / Shop Guardrail Auditor`
    (`019ec87d-b626-7d10-af4a-867168753341`): nessun blocker security; route
    preview/apply restano server-side, shop-scoped, senza service role client.
- Review fix layout overflow 2026-06-14:
  - `UI Layout Auditor` (`019ec8be-ead2-74a3-9a0f-61f25d703ff9`): audit
    read-only; ha confermato overflow da shell modal, header file badge,
    banner/chip, griglie senza `min-w-0`, issue list sempre aperte e tabella
    prodotti Step 3 aperta di default.
  - `Database Transfer UX Fixer` (`019ec8be-fbe8-7441-acea-a41d81a4a51f`):
    patch concept read-only; ha richiesto `IssueList` collassabile, Step 2
    compatto, Step 3 con product rows dietro `Show detailed product rows` e
    rimozione del Back footer.
  - `Overflow / Responsive QA Agent` (`019ec8bf-4f36-7e10-b3df-628ba42974fc`):
    audit read-only; ha indicato guard statici/browser per `overflow-x-hidden`,
    width controllata, `min-w-0`, table scroll interno e file badge troncato.
  - `Test & Regression Agent` (`019ec8bf-5f90-7312-9461-12ea08781576`): audit
    read-only; ha proposto asserzioni statiche per Back footer assente, dettagli
    prodotti collassati, warning/safety in `details`, Advanced mapping chiuso e
    regressione supplier.
  - `Final Reviewer` (`019ec8bf-8ed3-7683-83e1-26e09e465024`): checklist
    read-only finale; ha confermato i gate da verificare senza backend/schema,
    senza stage/commit e senza workbook reale nel repo.
- DONE closure loop 2026-06-15:
  - `Foundation Failure Triage Agent`
    (`019ec928-4367-7190-bfd5-e54d1ac99b6c`): ha confermato che i `27`
    failure residui di `npm run test:foundation` erano mismatch statici
    obsoleti dopo i18n/layout (`dictionary`, `labels`, `localizedSection`),
    non regressioni database transfer.
  - Altri subagent richiesti non sono stati avviabili per limite thread
    raggiunto; il fix, l'E2E e i gate finali sono stati completati nel main
    agent, mantenendo le sezioni richieste in questa evidence.

## Fonti lette

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-060-supplier-excel-android-style-preview-import.md`
- `docs/TASKS/EVIDENCE/TASK-060/README.md`
- `package.json`
- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
- `node_modules/next/dist/docs/01-app/02-guides/data-security.md`

## Audit Android locale

Repository Android letto in modalita read-only:
`/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView`.

File Android verificati:

- `app/src/main/java/com/example/merchandisecontrolsplitview/util/DatabaseExportWriter.kt`
- `app/src/main/java/com/example/merchandisecontrolsplitview/util/FullDbImportStreaming.kt`
- `app/src/test/java/com/example/merchandisecontrolsplitview/util/DatabaseExportWriterTest.kt`
- `app/src/test/java/com/example/merchandisecontrolsplitview/util/FullDbExportImportRoundTripTest.kt`
- `app/src/main/java/com/example/merchandisecontrolsplitview/data/Product.kt`
- `app/src/main/java/com/example/merchandisecontrolsplitview/data/ProductPrice.kt`
- `app/src/main/res/values-es/strings.xml`
- `app/src/main/res/values-en/strings.xml`
- `app/src/main/res/values/strings.xml`
- `app/src/main/res/values-zh/strings.xml`

Formato Android confermato dal codice:

- Sheet tecnici: `Products`, `Suppliers`, `Categories`, `PriceHistory`.
- Workbook completo: tutti e quattro gli sheet.
- Workbook parziale: selezione arbitraria non vuota; filename
  `Database_partial_<sigils>_<timestamp>.xlsx`.
- `Products` usa header localizzati; il sample spagnolo corrisponde a
  `values-es/strings.xml`.
- `Suppliers` e `Categories`: header tecnici `id`, `name`.
- `PriceHistory`: `productBarcode`, `timestamp`, `type`, `oldPrice`,
  `newPrice`, `source`.
- `type` esportato come `purchase` o `retail`.
- `oldPrice` e informativo/derivato dalla riga precedente per
  barcode+type; `newPrice` e il prezzo effettivo importabile.
- `timestamp` e stringa Room `yyyy-MM-dd HH:mm:ss`.
- Prezzi/quantita sono `Double` Android, nessuna conversione centesimi/minor
  units nel writer.

## Audit Admin Web

File Admin Web verificati:

- `src/server/shop-admin/import-export-workbook.ts`
- `src/server/shop-admin/catalog-import-contract.ts`
- `src/server/shop-admin/catalog-mutations.ts`
- `src/server/shop-admin/import-export-readiness.ts`
- `src/app/shop/_components/ImportExportActionPanel.tsx`
- `src/app/shop/import-export/preview/route.ts`
- `src/app/shop/import-export/apply/route.ts`
- `supabase/migrations/20260612015644_task_057_shop_scoped_mobile_history.sql`
- `src/lib/supabase/database.types.ts`

Stato repo-grounded:

- Esiste gia `importMode: "database"`.
- Esiste gia parsing server-side `Products`, `Suppliers`, `Categories`,
  `PriceHistory`.
- Esiste gia RPC reale `shop_catalog_import_price_history(p_shop_id, p_prices)`
  con check shop scope via `app_private.resolve_shop_catalog_scope`.
- Esiste gia bulk product import `shop_catalog_import_products`.
- Gap iniziale: il database transfer UI/preview restava centrato sul mapping
  prodotto e non esponeva chiaramente detection Android, summary per sheet e
  campioni per `Suppliers`, `Categories`, `PriceHistory`.

## Review cleanup con workbook reale

Workbook locale ispezionato senza copiarlo nel repository:
`/Users/minxiang/Downloads/Database_2026_06_04_19-09-08.xlsx`.

Diagnostica eseguita con `@e965/xlsx`:

- Sheet presenti: `Products`, `Suppliers`, `Categories`, `PriceHistory`.
- `Products`: `21181` righe, header spagnoli Android, `missingBarcode: 0`,
  `barcodeLongerThan96: 0`.
- Vecchia regola Admin Web `8-14 digits`: `25` failure.
- Nuova regola Android database transfer: `androidBarcodeValidationFailures: 0`.
- Safety-leading text cells in campi testo prodotto: `10`; sono note non
  bloccanti e restano protette in output spreadsheet.
- `Suppliers`: `59` righe, `missingName: 0`.
- `Categories`: `24` righe, `missingName: 0`.
- `PriceHistory`: `44295` righe, `missingProduct: 0`, `missingType: 0`,
  `missingNewPrice: 0`, `purchase: 22414`, `retail: 21881`.
- `@e965/xlsx` ha stampato warning ZIP `Bad uncompressed size ... != 0`, ma ha
  letto correttamente il workbook; il file non e stato persistito nel repo.

Root cause:

- Il blocco rosso generico derivava da `shopAdminActionResult("validation_failed")`
  dopo errori `Products.barcode` generati dalla validazione `8-14 digits`.
- Questa validazione e corretta per supplier/generic product import, ma non per
  Android database export: Android e backend Admin Web bulk usano barcode
  testuale non vuoto, con limite effettivo Admin Web `96` caratteri.
- `Leading formula character escaped` era confluito in `rowWarnings`, quindi
  appariva come warning operativo; ora e `safetyNotes` separato.

## Review fix layout overflow

Problemi visuali riportati dagli screenshot utente:

- Step 2/3 con contenuti che uscivano dalla modal e overflow orizzontale
  globale.
- Banner Android con chip sheet tagliati a destra.
- Card `Products` / `Suppliers` / `Categories` / `PriceHistory` senza
  contenimento sufficiente su viewport medi.
- Warnings e safety sanitization sempre aperti e troppo rumorosi.
- Step 3 dominato da tabella prodotti aperta, con potenziale preview da centinaia
  di righe.
- Footer Step 3 sovraccarico, con Back ridondante oltre al Back in titlebar.

Fix applicati:

- `CatalogDialog` usa ora width `sm:w-[min(1500px,calc(100vw-96px))]`,
  `max-h-[calc(100vh-64px)]`, header sticky, body con `overflow-y-auto` e
  `overflow-x-hidden`.
- File badge in header reso compatto con `min-w-0`, `shrink`, nome file
  troncato e bottone Close sempre `shrink-0`.
- Banner, griglie summary, card sheet e pannelli principali ricevono
  `min-w-0`/`max-w-full`; le tabelle larghe hanno scroll orizzontale interno.
- Step 2 database non ripete piu il `SummaryGrid` dopo le sheet card; mostra un
  messaggio verde compatto `No blocking rows detected.` quando applicabile.
- `Advanced mapping` resta in `details` chiuso di default; i sample sheet sono
  limitati a massimo `5` righe visibili e scrollano internamente.
- `Operational warnings` e `Safety sanitization` sono collassati di default.
- Step 3 database mostra summary + sezioni collassabili (`Workbook sheet
  details`, `Android sheet samples`, `Show detailed product rows`) e limita i
  dettagli prodotti a `20` righe quando aperti.
- Back nel footer Step 3 rimosso; footer ora contiene solo label, input
  `IMPORT DATABASE`, bottone import e hint/disabled reason.

## Modifiche implementate

- `docs/specs/android-database-export-format.md`: spec tecnica del formato
  Android auditato.
- `src/server/shop-admin/import-export-workbook.ts`: detection
  `android_database_export`, sheet summaries, supporto full/partial e
  fallback product-sheet disabilitato per workbook Android database senza
  `Products`; validazione barcode flessibile solo per Android database export;
  safety sanitization separata da warning operativi; preview rows decorate per
  `sheet + rowNumber`; summary con new/update suppliers/categories e
  `PriceHistory` purchase/retail; apply database con digest shop-bound, check
  esplicito dei payload RPC `ok:false`, invalidazione preview stale e delega
  dei bulk write staff-aware al boundary dedicato.
- `src/server/shop-admin/staff-aware-mutations.ts`: nuovo boundary server-only
  per bulk product import e bulk PriceHistory import staff-aware, con
  `resolveInventoryOwner`, chunking e row error bounded. Questo sposta i bulk
  write staff-aware fuori da `import-export-workbook.ts`.
- `src/server/shop-admin/inventory-read-model.ts`: ordinamenti secondari
  stabili nelle query paginate, per evitare skip/duplicazioni con timestamp
  uguali su export/retry grandi.
- `src/server/shop-admin/catalog-import-contract.ts`: duplicate SKU Android
  restano warning non bloccante e non riducono `newProducts`/update
  classification quando il barcode e valido.
- `src/server/shop-admin/action-context.ts`: aggiunto codice
  `partial_failure` con messaggio specifico.
- `src/app/shop/_components/CatalogActionPanel.tsx`: modal Database transfer
  larga con Back e file badge in titlebar, come Supplier workbook preview;
  review-fix con width controllata, header sticky, body senza overflow
  orizzontale globale e close disabilitabile durante apply.
- `src/app/shop/_components/ImportExportActionPanel.tsx`: UI database transfer
  multi-sheet con banner Android, summary sheet, sample bounded e preview
  database read-only; fix post-review per mostrare anche `validation_failed`
  database con soli `sheetSummaries`/`rowErrors`; labels `Workbook / Check
  workbook / Review import`; mapping Android automatico con override sotto
  `Advanced mapping`; safety notes non bloccanti; review-fix layout con Step 2
  compatto, warning/safety collassati, Step 3 senza tabella gigante aperta,
  footer semplificato, busy state `Importing database...`, `aria-busy` e
  controlli disabilitati durante apply.
- `tests/foundation/task-057-shop-catalog-workspace-import-intelligence.test.mjs`:
  regressione aggiornata per la rimozione del wrapper `Advanced database
  transfer` e per il nuovo boundary staff-aware bulk.
- `tests/foundation/task-061-android-database-export-transfer.test.mjs`: test
  governance, detection/parser, UI multi-sheet, digest stable retry, busy
  feedback/failure invalidation, staff-aware boundary, ordinamento paginato
  stabile e duplicate SKU warning-only.
- `tests/foundation/task-060-supplier-excel-android-style-preview-import.test.mjs`:
  asserzioni aggiornate per distinguere supplier editable da database
  read-only e per la nuova shell modal anti-overflow.
- `tests/foundation/task-032-excel-hardening.test.mjs`: atteso aggiornato per
  duplicate SKU warning-only che non riduce `newProducts`.
- `tests/foundation/*`: closure loop delle asserzioni statiche obsolete per
  i18n/layout, aggiornate a verificare `dictionary`, `labels` e
  `localizedSection` senza indebolire i controlli utili.
- `docs/TASKS/TASK-061-android-database-export-transfer-compatibility.md` e
  `docs/MASTER-PLAN.md`: riconciliazione a `DONE` / `DONE_RECONCILED`.

## Check eseguiti

| Comando / metodo | Esito | Evidence sintetica |
|---|---|---|
| Diagnostica workbook reale Android `/Users/minxiang/Downloads/Database_2026_06_04_19-09-08.xlsx` | `PASS_WITH_NOTES` | Sheet completi; nuova validazione Android barcode `0` failure; vecchia `8-14 digits` avrebbe prodotto `25` failure; safety-leading text `10` non bloccanti; PriceHistory `22414` purchase / `21881` retail. |
| Refactor security-safe staff-aware | `PASS` | `import-export-workbook.ts` non contiene piu bulk write staff-aware diretti su `inventory_products`/`inventory_product_prices`; delega a `applyStaffAwareBulkProductImport` e `applyStaffAwareBulkPriceHistoryImport` in `staff-aware-mutations.ts`. |
| Foundation closure loop | `PASS` | `27` failure residui classificati e corretti come asserzioni statiche obsolete i18n/layout; `npm run test:foundation` finale `308/308`. |
| E2E reale primo apply con workbook Downloads | `PASS` | Browser laterale usato per login/modal visibile; upload/apply reale eseguito in browser Playwright headed visibile su `http://127.0.0.1:3050`. Step 2 PASS, Step 3 PASS, preview `newProducts=21181`, apply HTTP `200`, `failedRows=0`. |
| Conteggi DB dopo primo apply | `PASS` | Fixture locale sintetica `TASK061_*` inizialmente a zero; dopo apply: Products `21181`, Suppliers `59`, Categories `24`, PriceHistory `44295`. |
| Retry/idempotenza reale con stesso workbook | `PASS` | Preview retry `newProducts=0`, `blockedRows=0`; retry apply HTTP `200`, `failedRows=0`; conteggi invariati Products `21181`, Suppliers `59`, Categories `24`, PriceHistory `44295`. |
| Cleanup sintetico locale | `PASS` | Cleanup `TASK061_*` post-verifica completato; Products `0`, Suppliers `0`, Categories `0`, PriceHistory `0` per la fixture locale. |
| UX import reale | `PASS` | Durante apply: banner busy `Importing Android database export...`, bottone `Importing database...`, input conferma disabilitato, apply button disabilitato, close modal disabilitato; nessun errore rosso generico nel percorso PASS. |
| `node --test tests/foundation/task-061-android-database-export-transfer.test.mjs` | `PASS` | 9 test, 9 pass, 0 fail. |
| `node --test tests/foundation/task-060-supplier-excel-android-style-preview-import.test.mjs` | `PASS` | 13 test, 13 pass, 0 fail. |
| `npm run test:foundation` | `PASS` | 308 test, 308 pass, 0 fail. |
| `npm run typecheck` | `PASS` | `next typegen && tsc --noEmit`; `Types generated successfully`. |
| `npm run lint` | `PASS` | `eslint` exit code 0. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run build` | `PASS_WITH_WARNINGS` | Build Next completata; warning preesistenti/framework su `middleware` deprecato e `[DEP0205] module.register()`. |
| `npm run verify` rerun singolo | `PASS_WITH_WARNINGS` | `lint`, `typecheck`, `security:scan`, `build` passano; stessi warning build `middleware` deprecato e `[DEP0205] module.register()`. |
| `git diff --check` | `PASS` | Nessun output. |
| `git status --short --branch --untracked-files=all` | `PASS_WITH_NOTES` | Branch `codex/task-061-android-database-export`; nessun commit/push/stage; workbook reale non copiato nel repo. |

## Stato finale worktree

Ultimo `git status --short --branch --untracked-files=all`:

```text
## codex/task-061-android-database-export
 M docs/MASTER-PLAN.md
 M docs/TASKS/EVIDENCE/TASK-035/browser-shop-overview-authenticated.png
 M scripts/security-checks.mjs
 M src/app/auth/login/page.tsx
 M src/app/layout.tsx
 M src/app/shop/_components/ActionResultBanner.tsx
 M src/app/shop/_components/CatalogActionPanel.tsx
 M src/app/shop/_components/ImportExportActionPanel.tsx
 M src/app/shop/audit/page.tsx
 M src/app/shop/categories/page.tsx
 M src/app/shop/layout.tsx
 M src/app/shop/products/page.tsx
 M src/app/shop/settings/page.tsx
 M src/app/shop/suppliers/page.tsx
 M src/app/shop/sync/page.tsx
 M src/components/auth/AccessState.tsx
 M src/components/auth/AuthForm.tsx
 M src/components/auth/ShopCodeLoginForm.tsx
 M src/components/platform/AppShell.tsx
 M src/components/platform/PlatformPage.tsx
 M src/components/platform/PlatformSidebarNav.tsx
 M src/components/shop/ShopSectionPage.tsx
 M src/components/shop/ShopShell.tsx
 M src/server/shop-admin/action-context.ts
 M src/server/shop-admin/catalog-import-contract.ts
 M src/server/shop-admin/import-export-workbook.ts
 M src/server/shop-admin/inventory-read-model.ts
 M src/server/shop-admin/staff-aware-mutations.ts
 M tests/foundation/shop-admin-shell.test.mjs
 M tests/foundation/shop-switcher.test.mjs
 M tests/foundation/task-014-design-system.test.mjs
 M tests/foundation/task-032-excel-hardening.test.mjs
 M tests/foundation/task-032-shop-admin-polish.test.mjs
 M tests/foundation/task-035-authenticated-admin-web-qa-shop-admin-smoke-harness.test.mjs
 M tests/foundation/task-036-admin-web-readiness.test.mjs
 M tests/foundation/task-037-dual-access-model.test.mjs
 M tests/foundation/task-043-platform-admin-runtime-fixes.test.mjs
 M tests/foundation/task-047-master-admin-access-model.test.mjs
 M tests/foundation/task-048-master-console-secondary-sections-ux-polish.test.mjs
 M tests/foundation/task-049-master-console-admins-ui-polish.test.mjs
 M tests/foundation/task-051-platform-provisioning-fiscal-pos-first.test.mjs
 M tests/foundation/task-052-admin-console-ux-polish-shell-parity.test.mjs
 M tests/foundation/task-052-hide-public-master-entrypoint.test.mjs
 M tests/foundation/task-053-unified-admin-console-login-tabs.test.mjs
 M tests/foundation/task-054-shop-admin-auth-navigation.test.mjs
 M tests/foundation/task-054-shop-code-recovery-diagnostics.test.mjs
 M tests/foundation/task-055-shop-admin-ui-polish.test.mjs
 M tests/foundation/task-056-master-console-shop-detail-editing.test.mjs
 M tests/foundation/task-057-shop-catalog-workspace-import-intelligence.test.mjs
 M tests/foundation/task-060-supplier-excel-android-style-preview-import.test.mjs
?? docs/TASKS/EVIDENCE/TASK-061/README.md
?? docs/TASKS/TASK-061-android-database-export-transfer-compatibility.md
?? docs/specs/android-database-export-format.md
?? src/components/language-switcher.tsx
?? src/i18n/dictionaries.ts
?? src/i18n/get-locale.ts
?? src/i18n/locales.ts
?? src/i18n/translate-sections.ts
?? tests/foundation/task-061-android-database-export-transfer.test.mjs
?? tests/foundation/task-062-global-i18n-locale.test.mjs
```

Nota: `docs/TASKS/EVIDENCE/TASK-035/browser-shop-overview-authenticated.png`
era gia modificato prima di TASK-061 e non e stato revertito. Le modifiche
i18n/layout (`src/i18n/*`, `src/components/language-switcher.tsx`,
`tests/foundation/task-062-*` e varie pagine/shell) erano gia presenti nel
worktree corrente e sono rimaste fuori scope.

## Rischi residui

- Non e stato committato nessun workbook reale Android e il file reale non e
  stato copiato nel repository.
- `npm run test:foundation` e verde dopo il closure loop (`308/308`). I test
  statici obsoleti sono stati aggiornati a contratti i18n/localizedSection.
- I warning build `middleware` deprecato e `[DEP0205] module.register()` sono
  presenti nel tooling/framework e non sono stati affrontati perche fuori
  scope.

## Handoff

- Prossima fase: `DONE_RECONCILED`.
- Stato task: `DONE`.
- Condizione per `DONE`: soddisfatta con refactor security-safe, E2E reale
  completo post-refactor, retry/idempotenza, cleanup, gate finali e evidence
  aggiornata.
- Commit/push/stage: non eseguiti.
