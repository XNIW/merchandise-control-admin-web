# 10 - Handoff storico pre-consolidamento TASK-137

Questo documento fotografa il primo handoff locale. Lo stato corrente è nel
checkpoint `12-publish-checkpoint.md`: commit locali creati sui tre repository,
Admin pgTAP `76/76`, foundation clean-merge `20/20`, Android rerun invalidato
`1/1`, iOS `22/22`; la validazione pulita è completa e il Security Changes
scan resta pendente. Le frasi
successive su “nessun commit” descrivono soltanto quel checkpoint storico.

## Stato

`REVIEW_WITH_BLOCKERS`, non `DONE`.

Implementazione e gate locali sono conclusi. Restano quattro blocker dichiarati:

1. parity live Admin/Android/iOS sul medesimo shop Supabase non-production
   `NOT_RUN`;
2. security-diff-scan ufficiale `BLOCKED_SETUP_NOT_STARTED`;
3. migration TASK-137 su staging/dev `NOT_APPLIED` per vincolo esplicito;
4. consolidamento/publish Git definitivo `IN_PROGRESS`.

## Contratto consegnato

- tabella lifecycle server-only e due riferimenti current nullable sul prodotto;
- bucket privato JPEG-only `product-images`, max `1 MiB`;
- owner/manager write; viewer read; cashier/suspended/revoked/cross-shop deny;
- intent -> due PUT diretti -> finalize atomico;
- read URL effimeri e remove idempotente;
- sync `catalog_changed` con soli `product_ids`;
- cleanup 24h dry-run default e report operativo read-only;
- nessun blob, Base64, token, signed URL o path Storage nel dominio/sync.

## File TASK-137 - Admin Web / Supabase

- governance/evidence: `docs/MASTER-PLAN.md`, task canonico e intera directory
  `docs/TASKS/EVIDENCE/TASK-137/`;
- package/harness: `package.json`, `scripts/security-checks.mjs`; il test
  TASK-027 preesistente resta escluso dal consolidamento TASK-137;
- operations: `scripts/admin/task-137-product-image-cleanup.mjs`,
  `scripts/admin/task-137-product-image-report.mjs`;
- API: le quattro route sotto `src/app/api/shop/product-images/`;
- server: i cinque file sotto `src/server/shop-admin/product-images/`;
- browser/UI: `src/lib/product-images/browser-client.ts`,
  `ProductImageControls.tsx`, `ProductDetailModalController.tsx`,
  `src/app/shop/products/page.tsx`;
- mapping/access: `database.types.ts`, `inventory-read-model.ts`,
  `detail-modal-read-model.ts`, `page-access.ts`;
- database: le tre migration TASK-137, inclusa quella di hardening cleanup, e
  `supabase/tests/task_137_product_catalog_images.sql`;
- test: foundation TASK-137 ed E2E locale TASK-137.

## Consolidamento Mac 2026-07-17

L'audit finale ha prodotto tre patch minime, senza dipendenze nuove:

- cleanup Admin bounded anche per oggetti Storage canonici, scaduti e privi di
  lifecycle row; i path restano redatti tramite hash;
- URL Storage firmate vincolate all'origin Supabase configurato in Admin,
  Android e iOS, con path firmato ancorato;
- remove iOS fail-closed su stato e versione, con cache preservata in caso di
  risposta incoerente.

Check mirati realmente eseguiti prima del freeze: Admin foundation TASK-137
`19/19 PASS`; Android unit contract `PASS` e compilazione androidTest `PASS`;
iOS `ProductImageAPIClientTests` `5/5 PASS`. I gate completi sul branch
validate restano la fonte autoritativa per il freeze Security.

## File TASK-137 - Android

- build/schema: `app/build.gradle.kts`, Room schema `20.json`;
- runtime wiring/data: `MerchandiseControlApplication.kt`, `AppDatabase.kt`,
  `InventoryCatalogRemoteRows.kt`, `InventoryRepository.kt`, `Product.kt`,
  `ProductDao.kt`;
- feature: i cinque file del package `productimage`;
- UI: `DatabaseScreen.kt`, `DatabaseScreenComponents.kt`,
  `EditProductDialog.kt`, `DatabaseViewModel.kt`;
- platform: `file_paths.xml`, quattro `strings.xml`, manifest androidTest,
  manifest Debug e `task137_network_security_config.xml`;
- test: migration/repository, `ProductImageCatalogContractTest`, processor,
  cache e `ProductImageDeviceTest`;
- governance/evidence: Master Plan, task mirror e directory evidence TASK-137.

## File TASK-137 - iOS

- project/config: `project.pbxproj`, `SupabaseConfig.swift`,
  `SupabaseConfig.example.plist`, `iOSMerchandiseControlApp.swift`;
- model/UI: `Models.swift`, `DatabaseView.swift`, `EditProductView.swift`;
- feature: i sette file sotto `iOSMerchandiseControl/ProductImages/`;
- sync/mapping: `CatalogIncrementalApplyService.swift`,
  `SyncEventIncrementalApplyHelpers.swift`, `SupabaseManualPushService.swift`,
  `SupabasePullApplyService.swift`, `SupabasePullPreviewModels.swift`,
  `SupabasePullPreviewService.swift`, `SwiftDataInventorySnapshotService.swift`,
  `CatalogRemoteSupabaseAdapter.swift`, `SupabaseInventoryDTOs.swift`;
- localizzazioni: en/it/es/zh-Hans `Localizable.strings`;
- test: i quattro XCTest sotto `iOSMerchandiseControlTests/ProductImages/`;
- governance/evidence: Master Plan, task mirror e directory evidence TASK-137.

Win7POS: nessun file modificato dal task, worktree pulito. Durante il closeout
`HEAD/origin/main` e avanzato esternamente dallo snapshot reviewer `ca1e57a`
a `5160b7c` (`merge: reconcile Asus Win7POS work with latest main`); il main
agent non ha eseguito fetch, pull, checkout, commit o push in quel repository.

## Risultati

- Supabase locale: dry-run migration vuoto, pgTAP `58/58`, cleanup/report
  residuo zero;
- Admin: foundation `15/15`, verify/build/lint/typecheck ed E2E finali `PASS`;
- Admin performance: preprocess isolato `24,8 ms`, input `929.526 B`, output
  `27.887 B`, picco heap JavaScript campionato `22.478.432 B`;
- Android: unit `25/25`, instrumentation `3/3`, assemble/lint `PASS`; fixture
  sintetica `48 MP` in `41 ms`, nessun OOM, main+thumb `183.286 B`;
- iOS: image `17/17`, sync `46/46`, localizzazioni `8/8`, build `PASS`;
- `git diff --check`: quattro repository `PASS`;
- evidence TASK-137 e artefatti temporanei controllati a `0644`; scan locale
  ad alta confidenza per JWT/secret/database URL con password: nessun match;
- artefatti metrici iOS gia copiati fuori da `/private/tmp` nel mirror
  durevole; la copia temporanea residua contiene solo JSON sintetici redatti;
- dipendenze aggiunte: nessuna.

Metriche e costi sono nei documenti `03`-`08`. La media misurata main+thumb e
`83.587,33 B`; stima 1.000/10.000/20.000 prodotti:
`79,715 MiB` / `797,151 MiB` / `1.594,302 MiB`.

## Stato repository al closeout

- Admin `20f430f8c6e7`, `main` behind `origin/main` di 5: `94 M`, `44 ??`;
- Android `8e7c88918d52`, `main...origin/main`: `19 M`, `9 ??`;
- iOS `2801241a646c`, `main...origin/main`: `76 M`, `23 ??`;
- Win7POS `5160b7c15743`, `main...origin/main`: worktree pulito;
- `git diff --check`: `PASS` in tutti e quattro i repository.

I conteggi Admin/iOS includono modifiche accumulate da task precedenti e non
vengono attribuiti integralmente a TASK-137. Nessun file e stato staged.

## Stato ambienti

- Supabase locale: attivo, migration TASK-137 gia applicate localmente,
  dry-run migration vuoto e pgTAP `58/58` preservati;
- cleanup/report finali locali: `PASS`, residuo zero;
- Supabase staging/dev: nessuna migration o fixture TASK-137 applicata;
- production: non interrogata, modificata o deployata.

## Rischi residui

- nessuna prova di auth/sessione reale mobile, rete Supabase e propagazione
  live tra i tre client;
- preflight finale: Android emulator connesso ma app/sessione assenti; iOS
  Simulator booted; nessuna fixture live creata;
- nessuna prova su device fisici o comparabilita termica/memoria;
- stessa fixture binaria sui tre client: `NOT_RUN`;
- Admin misura heap JavaScript campionato, non picco RSS fisico del browser;
- la media Storage usa sei fixture sintetiche eterogenee;
- cleanup non e schedulato: lo script deve essere orchestrato separatamente;
- security-diff-scan ufficiale non avviato dal pannello.

## Conferme

- nessun commit;
- nessun push;
- nessun deploy production;
- nessuna modifica Supabase production o staging;
- nessun secret esposto;
- Win7POS non modificato.
