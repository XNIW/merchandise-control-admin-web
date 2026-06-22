# TASK-079B - Supplier Import to Canonical History Entry + Mobile Sync

## Informazioni generali

- ID: `TASK-079B`
- Titolo: `Supplier Import to Canonical History Entry + Mobile Sync`
- Stato: `REVIEW`
- Fase attuale: `REVIEW`
- Responsabile attuale: `REVIEWER`
- Data apertura: `2026-06-21`
- Origine: brief utente allegato `TASK-079B - Supplier Import to Canonical History Entry + Mobile Sync`
- Task base: `TASK-079`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-079B/README.md`

## Dipendenze

- Documenti da leggere: `docs/MASTER-PLAN.md`, questo file task, brief allegato,
  guide Next.js mutazioni/route handlers in `node_modules/next/dist/docs/`.
- Task precedenti: `TASK-079`, `TASK-078C`, `TASK-072`, `TASK-063`.
- Dipendenze tecniche: contratto reale Android/iOS per `shared_sheet_sessions`,
  `session_overlay`, `payload_version`, `sync_events` e scope `shop_id` /
  `owner_user_id`.

## Scopo

Quando l'Admin Web applica davvero un import supplier Excel dal percorso
Products/import, deve creare o aggiornare in modo idempotente una History Entry
canonica in `shared_sheet_sessions` compatibile con Android/iOS, visibile nella
Cronologia mobile e nella pagina Admin History. La preview resta read-only e non
deve produrre side effect.

## Contesto

`TASK-079` ha reso lista e Detail History read-only allineati alla UX mobile,
ma non ha introdotto un write path. Oggi l'import supplier modifica prodotti e
prezzi, ma non garantisce una History Entry canonica leggibile dai client
mobile. Questo task chiude quel gap solo per Apply/import confermato, usando il
contratto mobile reale prima di scrivere dati mutativi.

## Non incluso

- Nessuna scrittura durante preview.
- Nessun campo inventato tipo `exported_at` / `synced_at`.
- Nessuna nuova dependency.
- Nessuna migration, nuova colonna, RLS/RPC o policy Supabase.
- Nessun secret, service-role key o dato reale lato client/browser.
- Nessuna modifica Android/iOS/POS/Win7POS.
- Nessun commit, stage, push, deploy, production apply o Supabase apply.

## File potenzialmente coinvolti

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-079B-supplier-import-canonical-history-mobile-sync.md`
- `docs/TASKS/EVIDENCE/TASK-079B/README.md`
- `src/app/shop/import-export/apply/route.ts`
- `src/app/shop/import-export/preview/route.ts`
- `src/app/shop/_components/ImportExportActionPanel.tsx`
- `src/app/shop/_components/CatalogActionPanel.tsx`
- `src/app/shop/products/page.tsx`
- `src/server/shop-admin/import-export-workbook.ts`
- `src/server/shop-admin/history-mutations.ts`
- `src/server/shop-admin/sync-event-writer.ts`
- `src/server/shop-admin/*history*`
- `tests/foundation/*.test.mjs`

## Criteri di accettazione

| CA | Descrizione | Tipo verifica | Stato |
|---|---|---|---|
| CA-01 | Contratto Android/iOS verificato da codice reale prima della scrittura. | Source review mobile | `PASS` |
| CA-02 | Preview supplier non crea/aggiorna History Entry. | Test/static route | `PASS` |
| CA-03 | Apply confermato crea/aggiorna `shared_sheet_sessions` canonica con `remote_id` stabile, `display_name`, supplier/category, `timestamp`, `updated_at`, `payload_version`, `data`, `session_overlay`, `shop_id`, owner mapping e `deleted_at: null`. | Test mapper + review codice | `PASS` |
| CA-04 | Retry/double click/stesso digest sono idempotenti e non duplicano entries. | Test idempotenza | `PASS` |
| CA-05 | `sync_events` viene scritto solo se il contratto reale esistente lo supporta. | Test/static + review codice | `PASS` |
| CA-06 | UI import mostra prima che Apply creera/aggiornera History e dopo successo mostra link/detail. | Test/static + smoke motivato | `PASS_WITH_NOT_RUN_SMOKE` |
| CA-07 | Guardrail Products `includeExactTotals: false` corretto se ancora regressivo. | Targeted TASK-078 | `PASS` |
| CA-08 | Check richiesti eseguiti o motivati come `NOT_RUN`/`BLOCKED`. | Comandi reali | `PASS_WITH_WARNINGS_AND_NOT_RUN` |

## Matrice CA -> evidence

| CA | Tipo verifica | Comando/Metodo previsto | Esito ammesso | Evidence prevista |
|---|---|---|---|---|
| CA-01 | Source review mobile | `rg`/lettura file Android+iOS mirati | `PASS` | File e campi verificati |
| CA-02..06 | Foundation mirata | `node --test tests/foundation/task-079b-*.test.mjs` | `PASS` | Output comando |
| CA-07 | Foundation regressione | `node --test tests/foundation/task-078-product-history-detail-modals.test.mjs` | `PASS` | Output comando |
| CA-08 | Gate progetto | `npm run lint`, `npm run typecheck`, `npm run build`, `npm run verify`, `git diff --check`, `git status` | `PASS` / `PASS_WITH_WARNINGS` / `NOT_RUN` / `BLOCKED` | Output sintetizzato |

## Decisioni

- La scrittura History avviene solo dopo Apply/import confermato e riuscito.
- Il mapper canonico resta server-side, senza dipendenze nuove, e testabile con
  funzioni pure per costruzione payload e identificatore stabile.
- `timestamp` rappresenta la data semantica della History Entry; `updated_at`
  resta freshness tecnica.
- La compatibilita mobile ha precedenza sulla shape visuale Admin.
- Il `remote_id` supplier import e deterministico da
  `admin-web:supplier-import-history:<shop_id>:<preview_digest>` e formattato
  come UUID v5-shaped lowercase.
- Il timestamp mobile viene salvato in UTC come `yyyy-MM-dd HH:mm:ss`, formato
  scritto da iOS e accettato da Android/iOS.
- `session_overlay` usa `overlay_schema: 1`, array `complete` allineato a
  `data` e `editable` come array di coppie stringa; per import applicati tutte
  le righe della griglia canonica risultano complete.
- `sync_events` usa solo il contratto reale gia presente:
  `domain="history"`, `event_type="history_changed"` e
  `entity_ids.session_ids` con il `remote_id`.

## Execution

- File controllati:
  - governance/task: `docs/MASTER-PLAN.md`,
    `docs/TASKS/TASK-079-history-entry-read-only-mobile-parity.md`, questo
    file, evidence TASK-079/TASK-079B;
  - Next docs: `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`,
    `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`;
  - Admin Web: import/export apply-preview, Products page, History mutations,
    import workbook, read/detail models e UI import;
  - Android: `SharedSheetSessionRecord.kt`,
    `SupabaseSessionBackupRemoteDataSource.kt`, `SyncEventModels.kt`,
    `InventoryRepository.kt`, `SessionRemotePayload.kt`;
  - iOS: `HistorySessionSyncShared.swift`,
    `HistorySessionRemoteSupabaseAdapter.swift`,
    `HistoryIncrementalApplyService.swift`.
- Modifiche fatte:
  - aggiunto mapper canonico
    `src/server/shop-admin/supplier-import-history-entry-contract.ts`;
  - aggiunto `upsertSupplierImportHistoryEntry` in
    `src/server/shop-admin/history-mutations.ts` con insert/update
    idempotente, owner mapping, fallback schema legacy senza `shop_id`, audit e
    `sync_events.history_changed`;
  - collegato `applyCatalogWorkbookImport` in
    `src/server/shop-admin/import-export-workbook.ts` solo dopo Apply supplier
    riuscito e senza effetti in preview;
  - aggiornata UI import in
    `src/app/shop/_components/ImportExportActionPanel.tsx` con avviso prima
    dell'Apply e link History Entry dopo successo;
  - aggiunte traduzioni in `src/i18n/dictionaries.ts`;
  - corretto `src/app/shop/products/page.tsx` a `includeExactTotals: false`;
  - aggiunto test foundation TASK-079B e aggiornato guardrail TASK-077
    coerente con la vista `shared_sheet_session_diagnostics`.
- Check eseguiti:
  - `node --test tests/foundation/task-079b-supplier-import-canonical-history.test.mjs`
    PASS 3/3;
  - `node --test tests/foundation/task-078-product-history-detail-modals.test.mjs`
    PASS 5/5;
  - `node --test tests/foundation/task-079-history-entry-read-only-parity.test.mjs`
    PASS 3/3;
  - `node --test tests/foundation/task-077-admin-console-real-shop-performance-hardening.test.mjs`
    PASS 8/8;
  - `npm run typecheck` PASS;
  - `npm run lint` PASS;
  - `npm run build` PASS_WITH_WARNINGS per warning noti Next `middleware` e
    Node `[DEP0205]`;
  - `npm run verify` PASS_WITH_WARNINGS per gli stessi warning noti;
  - `npm run test:foundation` PASS 420/420;
  - `git diff --check` PASS.
- Rischi rimasti:
  - browser Products import -> History detail non eseguito: il percorso
    autenticato richiede harness locale Supabase/service-role sicuro e dataset
    import end-to-end non disponibile nel runtime corrente; copertura presente
    con test statici/foundation e route preview side-effect-free;
  - smoke Android/iOS non eseguiti: nessun emulator/simulator/test harness
    mutativo pronto in questa sessione; contratto verificato da source mobile;
  - scrittura DB/audit/sync non esercitata contro Supabase live; nessun apply
    remoto/production eseguito per vincolo di scope;
  - se lo stesso `previewDigest` viene applicato due volte sullo stesso shop, la
    stessa History Entry viene aggiornata, non duplicata, per idempotenza
    intenzionale.
- Handoff: `READY_FOR_REVIEW`

## Review

- Decisione: `PENDING_USER_REVIEW`
- Evidence verificata: `PENDING_REVIEW`
- Problemi: `NESSUN_BLOCKER_REPO_CONTROLLABILE_NOTO`; restano smoke
  browser/mobile non eseguiti per harness/credenziali locali non pronti.
- Condizioni per passare a `DONE`: review positiva e conferma esplicita
  dell'utente.

## Chiusura

- Stato finale: `REVIEW`
- Conferma utente: `PENDING`
- Data chiusura: `PENDING`
- Follow-up aperti:
  - eseguire smoke autenticato Products import -> History detail con Supabase
    locale controllata quando il dataset/harness import end-to-end e pronto;
  - eseguire smoke Android/iOS con entry creata da Admin Web quando
    emulator/simulator e fixture mutativa sono disponibili.
