# TASK-069 Evidence - Cross-platform audit Admin Web, Android, iOS

## Stato

- Data: 2026-06-19
- Stato operativo: `DONE`
- Commit / push / stage / merge: `NOT_RUN_BY_REQUEST`
- Deploy / `db push` / migration apply: `NOT_RUN_BY_REQUEST`
- Secret exposure: `NONE_INTENDED`; evidence redatta, nessun token, hash, PIN,
  password o valore secret riportato.

## Repository e preflight

| Repo | Path | Branch/upstream | Preflight |
|---|---|---|---|
| Admin Web | `${ADMIN_WEB_REPO_PATH}` | `main...origin/main` | accessibile; task aperto in questo repo; diff locale prodotto da TASK-069. |
| Android | `${ANDROID_REPO_PATH}` | `main...origin/main` | accessibile; `.idea/deploymentTargetSelector.xml` sanificato successivamente in TASK-071 per rimuovere serial/path locali. |
| iOS | `${IOS_REPO_PATH}` | `main...origin/main` | accessibile; molti file evidence/screenshot untracked preesistenti non toccati. |

Comandi preflight usati dove applicabile:

- `git status --short --branch --untracked-files=all`
- `git diff --check`
- `git diff --stat`
- `git diff --name-only`
- lettura `README`, `AGENTS`, `CLAUDE`, `docs/MASTER-PLAN`, task e codice
  rilevante.

## CodeRabbit status

| Repo | Status | Evidenza |
|---|---|---|
| Admin Web | `RUN_SKIPPED_NO_COMMITTED_DIFF` | `coderabbit review --agent -t committed -c AGENTS.md` -> `review_skipped`, `No changes detected`, findings `0`. |
| Android | `RUN_SKIPPED_NO_COMMITTED_DIFF` | `coderabbit review --agent -t committed -c AGENTS.md` -> `review_skipped`, findings `0`; PR GitHub #1 aperta ma commenti/review CodeRabbit vuoti. |
| iOS | `RUN_SKIPPED_NO_COMMITTED_DIFF` | `coderabbit review --agent -t committed -c AGENTS.md` -> `review_skipped`, `No changes detected`, findings `0`. |

Nota: il reviewer H ha segnalato rischi locali da correggere, ma non erano
commenti CodeRabbit remoti. Le correzioni sono state applicate localmente e
verificate.

## Subagenti

| Subagente | Area | Esito |
|---|---|---|
| A | Admin Web Security / Supabase / Auth / RLS | `PASS_WITH_NOTES`; recovery one-time value intenzionale ma da trattare come residuo prodotto/security. |
| B | Admin Web UI/UX | `PASS_WITH_NOTES`; fix paginazione, azioni read-only e copy parziale; residui su ritorno lista filtrata e i18n completa. |
| C | Admin Web Products / Import / Sync readiness | `PASS_WITH_NOTES`; fix detail product lookup e parser numerico; residui su fallback azioni/list default 100. |
| D | Android sync / UX / security | `PASS_WITH_NOTES`; fix dirty fields, supplier/category marker e migration test helper; residuo tombstone catalogo locale. |
| E | iOS sync / UX / security | `PASS_WITH_NOTES`; fix tombstone supplier/category e alias relation fields; residui su pending anon/debug log IDs. |
| F | Cross-platform sync matrix | `PASS_WITH_NOTES`; owner-scoped compatibile, shop-scoped ancora incompleto/canonico. |
| G | Tooling / CI read-only | `PASS_WITH_NOTES`; Admin tooling buono, Android senza `git diff --check`/ktlint/detekt in CI, iOS senza CI dedicata. |
| H | Reviewer / QA gate | `CHANGES_REQUIRED_THEN_FIXED`; fix budget iOS, parser unsupported chars, aria labels prodotti e test tombstone SwiftData. |

## Finding e fix applicati

### Admin Web

- `getShopInventoryProductsPage` ora normalizza `page` con clamp minimo a 1.
- Il detail prodotto usa un read model esatto per `productId`, evitando il limite
  implicito dei primi 100 prodotti.
- Parser numerico localizzato condiviso in `src/lib/localized-number.ts`, usato
  da action context, workbook import/export e pannello import/export.
- Il parser accetta formati localizzati ragionevoli e rifiuta caratteri non
  supportati come `1/2`, `12:30`, `1_234`.
- La colonna Actions non mostra piu un menu vuoto in vista read-only.
- Paginazione prodotti e dialog supplier/category hanno copy parzialmente
  localizzato in `src/i18n/dictionaries.ts`.
- Aggiunta migration non applicata
  `supabase/migrations/20260619044500_task_069_sync_events_compacted_changed_count.sql`
  per alzare `record_sync_event.changed_count` a 100.000 mantenendo budget su
  metadata/entity IDs.

### Android

- `touchProductDirty` ora fonde i dirty fields consecutivi invece di sostituirli.
- Reassign/clear supplier/category marca la relazione corretta come dirty.
- I test repository coprono marker supplier/category e merge di edit locali.
- I test migration includono `AppDatabase.MIGRATION_17_18` e aspettano
  `PRAGMA user_version = 18`.

### iOS

- Supplier/category delete automatiche inviano tombstone remote quando l'ID non e'
  locale.
- Supplier/category delete locali restano ack locali per ID `supplier:local:` e
  `category:local:`.
- Payload supplier/category supporta `deleted_at`.
- Normalizzazione alias `supplierName -> supplier` e `categoryName -> category`.
- Budget `changed_count` sincronizzato a 100.000 in mapper RPC, validator,
  outbox, preflight manuale e test.
- I test tombstone verificano anche che i record SwiftData hard-deleted restino
  assenti.

## Matrice cross-platform sync

| Area | Admin Web | Android | iOS | Esito |
|---|---|---|---|---|
| Product create/update owner-scoped | supportato | supportato | supportato | `COMPATIBLE_WITH_NOTES` |
| Product relation dirty fields | parser/import allineati | fix merge + relation marker | fix alias relation fields | `COMPATIBLE_WITH_NOTES` |
| Supplier/category rename | supportato | supportato | supportato | `COMPATIBLE_WITH_NOTES` |
| Supplier/category delete | remote model via DB | residuo senza tombstone locale catalogo | fix remote tombstone | `PARTIAL` |
| Sync event `changed_count` | migration 100.000 non applicata | compatibile come consumer | fix 100.000 | `ALIGNED_NOT_APPLIED` |
| Shop-scoped canonical contract | non definitivo | non definitivo | non definitivo | `FOLLOW_UP_REQUIRED` |
| Import/export price parsing | fix parser condiviso | n/a | n/a | `ADMIN_WEB_PASS` |

## Check finali

### Admin Web

| Comando | Esito |
|---|---|
| `npm run test:foundation` | `PASS` 378/378. |
| `npm run verify` | `PASS`; warning noti Next `middleware` deprecation e Node `DEP0205`. |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3056 PLAYWRIGHT_WEB_SERVER_COMMAND="npm run start -- --hostname 127.0.0.1 --port 3056" PLAYWRIGHT_REUSE_SERVER=0 npm run test:shop:local` | `PASS` 5/5. |
| `git diff --check` | `PASS`. |

Nota smoke: i primi tentativi con `next dev` sono stati bloccati da un server
locale preesistente su `3055`; lo smoke finale e' passato via `next start` su
`3056` dopo build.

### Android

| Comando | Esito |
|---|---|
| `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew assembleDebug` | `PASS`. |
| `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew lintDebug testDebugUnitTest` | `PASS`; 524 test completati con 0 failure. |
| `git diff --check` | `PASS`. |

Nota: il primo full Android gate ha fallito su
`AppDatabaseMigrationTest` per helper non aggiornato a `MIGRATION_17_18`; fixato
e rerun finale passato.

### iOS

| Comando | Esito |
|---|---|
| XcodeBuildMCP `build_sim` | `PASS`, log `${XCODEBUILDMCP_WORKSPACE_PATH}/logs/build_sim_2026-06-19T05-12-26-471Z_pid31001_9223efa0.log`. |
| XcodeBuildMCP targeted `test_sim` | `PASS` 200/200, log `${XCODEBUILDMCP_WORKSPACE_PATH}/logs/test_sim_2026-06-19T05-11-56-113Z_pid31001_6eb62d5c.log`, xcresult `${XCODEBUILDMCP_WORKSPACE_PATH}/result-bundles/test_sim_2026-06-19T05-11-56-113Z_pid31001_5cee5ea6.xcresult`. |
| XcodeBuildMCP full `test_sim` precedente | `FAIL_WITH_PREEXISTING_SUITE_DRIFT`; 856 passed, 25 failed, 29 skipped, log `${XCODEBUILDMCP_WORKSPACE_PATH}/logs/test_sim_2026-06-19T04-58-14-933Z_pid31001_59fef1a9.log`, xcresult `${XCODEBUILDMCP_WORKSPACE_PATH}/result-bundles/test_sim_2026-06-19T04-58-14-933Z_pid31001_5ce02444.xcresult`. |
| `git diff --check` | `PASS`. |

Il full suite iOS non e' stato dichiarato verde. I fallimenti erano in larga
parte drift storico/manual release/static path/benchmark; alcuni static path dei
test sync-event selezionati sono stati fixati e verificati nella targeted suite.

## File toccati

### Admin Web

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-069-full-cross-platform-audit-admin-android-ios-sync-readiness.md`
- `docs/TASKS/EVIDENCE/TASK-069/README.md`
- `src/lib/localized-number.ts`
- `src/app/shop/_components/CatalogActionPanel.tsx`
- `src/app/shop/_components/ImportExportActionPanel.tsx`
- `src/app/shop/products/page.tsx`
- `src/i18n/dictionaries.ts`
- `src/server/shop-admin/action-context.ts`
- `src/server/shop-admin/import-export-workbook.ts`
- `src/server/shop-admin/inventory-read-model.ts`
- `src/server/shop-admin/shop-section-data.ts`
- `supabase/migrations/20260619044500_task_069_sync_events_compacted_changed_count.sql`
- `tests/foundation/task-069-cross-platform-audit-fixes.test.mjs`

### Android

- `${ANDROID_REPO_PATH}/app/src/main/java/com/example/merchandisecontrolsplitview/data/InventoryRepository.kt`
- `${ANDROID_REPO_PATH}/app/src/test/java/com/example/merchandisecontrolsplitview/data/AppDatabaseMigrationTest.kt`
- `${ANDROID_REPO_PATH}/app/src/test/java/com/example/merchandisecontrolsplitview/data/DefaultInventoryRepositoryTest.kt`

Sanificata successivamente da TASK-071 per rimuovere serial/path locali:
`${ANDROID_REPO_PATH}/.idea/deploymentTargetSelector.xml`.

### iOS

- `${IOS_REPO_PATH}/iOSMerchandiseControl/Sync/Automatic/Catalog/CatalogPushPayloads.swift`
- `${IOS_REPO_PATH}/iOSMerchandiseControl/Sync/Automatic/Catalog/CatalogPushService.swift`
- `${IOS_REPO_PATH}/iOSMerchandiseControl/Sync/Manual/SupabaseManualPushPreflightModels.swift`
- `${IOS_REPO_PATH}/iOSMerchandiseControl/Sync/Outbox/SyncEventOutboxEntry.swift`
- `${IOS_REPO_PATH}/iOSMerchandiseControl/Sync/Remote/SyncEventRPCRequestMapper.swift`
- `${IOS_REPO_PATH}/iOSMerchandiseControl/Sync/Remote/SyncEventRecording.swift`
- `${IOS_REPO_PATH}/iOSMerchandiseControlTests/SupabaseManualPushPreflightTests.swift`
- `${IOS_REPO_PATH}/iOSMerchandiseControlTests/SyncEventLiveRecorderTests.swift`
- `${IOS_REPO_PATH}/iOSMerchandiseControlTests/SyncEventOutboxDrainServiceTests.swift`
- `${IOS_REPO_PATH}/iOSMerchandiseControlTests/SyncEventOutboxEnqueueServiceTests.swift`
- `${IOS_REPO_PATH}/iOSMerchandiseControlTests/SyncEventOutboxStateTests.swift`
- `${IOS_REPO_PATH}/iOSMerchandiseControlTests/SyncEventRecordingTests.swift`
- `${IOS_REPO_PATH}/iOSMerchandiseControlTests/Task118AutomaticDomainTests.swift`
- `${IOS_REPO_PATH}/iOSMerchandiseControlTests/Task119AutomaticArchitectureTests.swift`

## Rischi residui e follow-up candidati

- Definire contratto canonico owner-scoped vs shop-scoped prima di promuovere
  sync cross-platform come completo.
- Android: introdurre o esplicitare strategia tombstone locale catalogo per
  supplier/category delete end-to-end.
- iOS: risolvere full suite drift prima di qualsiasi dichiarazione `DONE` o
  release gate; verificare residui su pending anon/debug log IDs.
- Admin Web: completare i18n residua e ritorno alla lista filtrata da detail.
- CI: aggiungere gate Android/iOS equivalenti a `git diff --check`, test e lint
  se il progetto vuole una release pipeline uniforme.

## Addendum TASK-071 closure

Stato finale dopo TASK-071: `DONE`.

Fix/verifiche aggiuntive:

- Admin Web staff shop-code login non enumera piu shop/staff validi via messaggi
  UI: i codici granulari restano server/audit-side, mentre UI e redirect legacy
  usano `sign_in_blocked`.
- Aggiornati `ShopCodeLoginForm`, action staff-login e test e2e/foundation
  correlati (`TASK-051`, `TASK-053`, `TASK-054`, `TASK-060`).
- Android: aggiunto backfill migration `17 -> 18` per dirty legacy refs a
  `__all__`, guard runtime per mask `NULL` e test mirati.
- Android: `.idea/deploymentTargetSelector.xml` sanificato per rimuovere
  serial/path locali segnalati dal QA finale.
- Check freschi TASK-071: Admin Web `security:scan` PASS, `test:foundation`
  PASS 378/378, `verify` PASS; Android `assembleDebug` PASS, targeted unit
  rerun PASS e `lintDebug testDebugUnitTest` PASS; iOS targeted `test_sim`
  resta PASS 200/200 da evidence subagent.
- CodeRabbit Admin Web finale: `BLOCKED_EXTERNAL_RATE_LIMIT`; non dichiarato
  PASS. Prima review finale aveva trovato solo path assoluti nei nuovi docs, poi
  rimossi e verificati con `rg`.
- Lo screenshot tracked `docs/TASKS/EVIDENCE/TASK-035/browser-shop-overview-authenticated.png`
  risulta modificato dai run smoke ed e' classificato come artefatto generato
  fuori scope, non rimosso senza richiesta.

## Prossima fase

Closure completata da TASK-071 come `DONE`. Residui: migration
Supabase non applicata, iOS full suite drift preesistente e roadmap
cross-platform.
