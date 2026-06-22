# Evidence TASK-079B - Supplier Import to Canonical History Entry + Mobile Sync

## Stato

- Task: `TASK-079B`
- Fase: `REVIEW`
- Data apertura: `2026-06-21`
- Verdict operativo: `READY_FOR_REVIEW`

## Evidence raccolta

### Contratto mobile verificato da source

File Android letti:

- `/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView/app/src/main/java/com/example/merchandisecontrolsplitview/data/SharedSheetSessionRecord.kt`
- `/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView/app/src/main/java/com/example/merchandisecontrolsplitview/data/SupabaseSessionBackupRemoteDataSource.kt`
- `/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView/app/src/main/java/com/example/merchandisecontrolsplitview/data/SyncEventModels.kt`
- `/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView/app/src/main/java/com/example/merchandisecontrolsplitview/data/InventoryRepository.kt`
- `/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView/app/src/main/java/com/example/merchandisecontrolsplitview/data/SessionRemotePayload.kt`

File iOS letti:

- `/Users/minxiang/Desktop/iOSMerchandiseControl/iOSMerchandiseControl/Sync/Shared/HistorySessionSyncShared.swift`
- `/Users/minxiang/Desktop/iOSMerchandiseControl/iOSMerchandiseControl/Sync/Remote/HistorySessionRemoteSupabaseAdapter.swift`
- `/Users/minxiang/Desktop/iOSMerchandiseControl/iOSMerchandiseControl/Sync/Automatic/Pull/HistoryIncrementalApplyService.swift`

Esito contratto:

- `remote_id` deve essere UUID lowercase; Android canonicalizza lowercase e iOS
  decodifica come `UUID`.
- `payload_version` compatibile mobile: `2`.
- `session_overlay` compatibile: `overlay_schema: 1`, `editable` come
  `[[String]]`, `complete` come `[Bool]`, lunghezze allineate a `data`.
- `data` e una griglia `[[String]]`.
- Owner: `owner_user_id` richiesto; Android supporta anche `shop_id`, iOS filtra
  owner-only e non seleziona `shop_id`.
- `sync_events` supporta `domain="history"`,
  `event_type="history_changed"`/`history_tombstone` e
  `entity_ids.session_ids` come array UUID.
- Timestamp: formato scritto da iOS e usato dal mapper Admin Web
  `yyyy-MM-dd HH:mm:ss` UTC; Android/iOS accettano anche varianti ISO.

### Modifiche Admin Web

- `src/server/shop-admin/supplier-import-history-entry-contract.ts`:
  mapper puro per payload History supplier import, UUID deterministico
  v5-shaped lowercase, timestamp mobile UTC, `payload_version: 2`, overlay
  schema `1`, `isManualEntry: false`, supplier/category summary e hash payload.
- `src/server/shop-admin/history-mutations.ts`:
  aggiunto `upsertSupplierImportHistoryEntry`, insert/update idempotente su
  `shared_sheet_sessions`, owner mapping, `deleted_at: null`, fallback schema
  legacy senza `shop_id`, audit e `sync_events.history_changed`.
- `src/server/shop-admin/import-export-workbook.ts`:
  creazione/aggiornamento History solo dopo Apply supplier riuscito, mai in
  preview; errore History post-import ritorna `partial_failure` esplicito.
- `src/app/shop/_components/ImportExportActionPanel.tsx`:
  avviso nella review supplier e messaggio post-successo con link alla History
  Entry.
- `src/i18n/dictionaries.ts`:
  copy import/History aggiunto per IT/ES/ZH.
- `src/app/shop/products/page.tsx`:
  guardrail performance corretto a `includeExactTotals: false`.
- `tests/foundation/task-079b-supplier-import-canonical-history.test.mjs`:
  coverage per mapper, idempotenza, route preview side-effect-free, wiring
  apply, sync event, UI e guardrail Products.
- `tests/foundation/task-077-admin-console-real-shop-performance-hardening.test.mjs`:
  guardrail riallineato alla vista lightweight
  `shared_sheet_session_diagnostics`.

### Strategia mutativa

- Creazione History solo in `applyCatalogWorkbookImport`, quando
  `adjustedParsed.importMode === "supplier"`, `failedRows === 0` e ci sono
  prodotti applicati.
- Preview supplier resta side-effect-free: il test statico vieta riferimenti a
  `upsertSupplierImportHistoryEntry`, `shared_sheet_sessions` e `sync_events`
  nella route preview.
- `remote_id` stabile:
  `admin-web:supplier-import-history:<shop_id>:<preview_digest>` trasformato in
  UUID deterministico v5-shaped lowercase.
- Idempotenza:
  upsert su `remote_id`; se una race produce `23505`, il codice rilegge la
  sessione esistente e aggiorna quella.
- Link Admin:
  `/shop/history/<remote_id>?shop_id=<shop_id>`.
- Sync:
  evento `history_changed` con `entity_ids.session_ids: [remote_id]`, metadata
  redatti `source_workflow: "supplier_import"` e seed da `payloadHash`.

## Check

- `node --test tests/foundation/task-079b-supplier-import-canonical-history.test.mjs`
  - Esito: `PASS`
  - Sintesi: `3/3` test passati.
- `node --test tests/foundation/task-078-product-history-detail-modals.test.mjs`
  - Esito: `PASS`
  - Sintesi: `5/5` test passati.
- `node --test tests/foundation/task-079-history-entry-read-only-parity.test.mjs`
  - Esito: `PASS`
  - Sintesi: `3/3` test passati.
- `node --test tests/foundation/task-077-admin-console-real-shop-performance-hardening.test.mjs`
  - Esito: `PASS`
  - Sintesi: `8/8` test passati.
- `npm run typecheck`
  - Esito: `PASS`
- `npm run lint`
  - Esito: `PASS`
- `npm run build`
  - Esito: `PASS_WITH_WARNINGS`
  - Warning noti: convenzione Next.js `middleware` deprecata in favore di
    `proxy`; Node `[DEP0205] module.register()` deprecato.
- `npm run verify`
  - Esito: `PASS_WITH_WARNINGS`
  - Note: primo run ha segnalato `.update(` nel mapper crypto; corretto usando
    `hash.write(...)`. Run finale `PASS_WITH_WARNINGS` con gli stessi warning
    noti `middleware`/`DEP0205`.
- `npm run test:foundation`
  - Esito: `PASS`
  - Sintesi: `420/420` test passati.
- `git diff --check`
  - Esito: `PASS`.
- Browser local Products import -> History detail
  - Esito: `NOT_RUN_AUTH_REQUIRED_HARNESS_NOT_AVAILABLE`
  - Motivo: nessuno smoke end-to-end import supplier -> History detail pronto
    nel runtime corrente; il ramo autenticato esistente richiede Supabase locale
    sicura/service-role process-only e dataset import completo.
- Android History smoke post Admin Web import
  - Esito: `NOT_RUN_HARNESS_NOT_AVAILABLE`
  - Motivo: emulator/test harness mutativo non pronto in questa sessione.
- iOS Cronologia smoke post Admin Web import
  - Esito: `NOT_RUN_HARNESS_NOT_AVAILABLE`
  - Motivo: simulator/test harness mutativo non pronto in questa sessione.

## Rischi residui

- Il percorso DB reale `shared_sheet_sessions`/audit/`sync_events` e stato
  verificato staticamente e con typecheck, ma non con apply live su Supabase.
- Browser end-to-end import supplier -> History detail non eseguito per mancanza
  di harness/dataset autenticato pronto nel runtime corrente.
- Android/iOS non sono stati eseguiti; compatibilita verificata da source
  contract reale.
- L'idempotenza aggiorna la stessa History Entry quando stesso shop e stesso
  `previewDigest` vengono riapplicati. Questo evita duplicati ed e il
  comportamento intenzionale.
- Nessun commit, stage, push, deploy, migration, production apply o Supabase
  apply eseguito.
