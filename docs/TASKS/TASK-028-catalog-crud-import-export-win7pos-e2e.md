# TASK-028 - Catalog CRUD, Excel import/export, and Win7POS catalog pull E2E

## Informazioni generali

- ID: `TASK-028`
- Titolo: `Catalog CRUD, Excel import/export, and Win7POS catalog pull E2E`
- Stato: `REVIEW`
- Fase attuale: `REVIEW`
- Responsabile attuale: `USER_REVIEW`
- Data apertura: `2026-06-01`
- Execution: `COMPLETED_BY_CODEX`
- Review: `PENDING_USER_REVIEW`
- Verdict corrente: `READY_FOR_DONE_CONFIRMATION`
- Commit: `NOT_REQUESTED`
- Git push: `NOT_REQUESTED`
- Stage: `NOT_REQUESTED`

## Baseline TASK-027

- Admin Web: `git status --short` -> clean
- Admin Web: `git diff --check` -> clean
- Win7POS: `git status --short` -> clean
- Win7POS: `git diff --check` -> clean

## Scope

TASK-028 unifica CRUD catalogo, import/export Excel e pull Win7POS E2E senza introdurre sync vendite o editing catalogo dal POS.

Include:

- restore controllato prodotti Admin Web tramite RPC auditata `shop_catalog_restore_product`;
- lettura separata prodotti attivi/archiviati con `deletedAt` e `archivedProducts`;
- import/export Excel preview-first, digest confermato e applicazione non distruttiva;
- riconoscimento colonne fornitore con header non in prima riga e alias spagnoli/cinesi osservati nel Drive fornitori;
- audit import/export con permessi separati `catalog.import` / `catalog.export` e fallimento chiuso se audit/context non passa;
- guard `Content-Length` prima del parsing multipart per bloccare workbook oltre limite senza caricare il body;
- validazione duplicati/conflitti e merge conservativo dei campi mancanti;
- Win7POS con diagnostica catalog pull, cursor/version/hasMore e applicazione tombstone locale tramite soft state `is_active`;
- no purge, no truncate, no replace-all e nessuna service-role nel client/browser.

Non include:

- TASK-024 sales sync;
- sync bidirezionale catalogo;
- editing catalogo da Win7POS verso Supabase;
- modifiche iOS/Android;
- nuove dipendenze;
- commit/push/stage.

## Drive fornitori

L'utente ha fornito la cartella Drive fornitori. Sono stati ispezionati campioni reali:

- `Vs20260519-456(Dingli).xlsx`: header dopo righe ordine/cliente, colonne `产品货号`, `条码`, `产品名1`, `产品名2`, `数量`, `单价`, `售价`.
- `20260520-Xianzhu.xlsx`: header in prima riga con `Código Producto`, `Nombre Producto`, `Cantidad`, `Precio`, `Código de Barra`.
- `Vs20260516-2(River Richer).xlsx`: formato cinese con header dopo metadata e colonna `小包装数` extra.

Il parser ora cerca la riga header per alias entro le prime righe e non assume piu che la prima riga sia la tabella prodotti.

## File toccati

### Admin Web

- `src/server/shop-admin/catalog-import-contract.ts`
- `src/server/shop-admin/import-export-workbook.ts`
- `src/server/shop-admin/catalog-mutations.ts`
- `src/app/shop/actions.ts`
- `src/app/shop/_components/CatalogActionPanel.tsx`
- `src/app/shop/import-export/preview/route.ts`
- `src/app/shop/import-export/apply/route.ts`
- `src/server/shop-admin/inventory-read-model.ts`
- `src/server/shop-admin/shop-section-data.ts`
- `src/lib/supabase/database.types.ts`
- `supabase/migrations/20260601160000_task_028_catalog_restore_product.sql`
- `tests/foundation/task-028-catalog-crud-import-export-win7pos-e2e.test.mjs`
- `tests/foundation/admin-web-ui-polish.test.mjs`
- `tests/foundation/task-014-pos-staff-foundation.test.mjs`
- `tests/foundation/task-018-infrastructure-security-pos-foundation.test.mjs`
- `tests/foundation/task-020-win7pos-integration-planning.test.mjs`
- `tests/foundation/task-022-023-pos-dashboard-win7pos-client.test.mjs`
- `tests/foundation/task-027-catalog-pull-delta-sync.test.mjs`
- `scripts/security-checks.mjs`
- `docs/ARCHITECTURE/WIN7POS-SYNC-POLICY.md`
- `docs/TASKS/TASK-028-catalog-crud-import-export-win7pos-e2e.md`
- `docs/TASKS/EVIDENCE/TASK-028/README.md`
- `docs/MASTER-PLAN.md`

### Win7POS

- `/Users/minxiang/Projects/Win7POS/src/Win7POS.Data/DbInitializer.cs`
- `/Users/minxiang/Projects/Win7POS/src/Win7POS.Data/Repositories/ProductRepository.cs`
- `/Users/minxiang/Projects/Win7POS/src/Win7POS.Wpf/Pos/Online/PosCatalogPullService.cs`
- `/Users/minxiang/Projects/Win7POS/scripts/check-pos-catalog-pull.ps1`

## Criteri di accettazione

| CA | Descrizione | Stato |
|---|---|---|
| CA-01 | CRUD catalogo mantiene create/update/archive e aggiunge restore controllato. | `PASS` |
| CA-02 | Import Excel e preview/apply sono shop-scoped, digest-gated e non distruttivi. | `PASS` |
| CA-03 | Riconoscimento colonne copre campioni Drive fornitori osservati. | `PASS` |
| CA-04 | Export/template resta sicuro contro formula injection. | `PASS` |
| CA-05 | Win7POS salva diagnostica cursor/version/hasMore/errori e applica tombstone soft. | `PASS` |
| CA-06 | Nessun purge distruttivo o service-role client/browser. | `PASS` |
| CA-07 | Evidence e Master Plan aggiornati. | `PASS` |
| CA-08 | Review/fix finale chiude audit import/export, limite upload multipart e visibilita prodotti archiviati. | `PASS` |

## Check

I check finali sono registrati in `docs/TASKS/EVIDENCE/TASK-028/README.md`.

## Review/fix 2026-06-01

- Corretto helper import/export: import preview/apply usa `catalog.import`, export usa `catalog.export`, e ogni audit/context failure chiude l'operazione senza successi silenziosi.
- Aggiunto controllo `Content-Length` prima di `request.formData()` su preview/apply per bloccare upload oltre `MAX_IMPORT_BYTES` con `413 file_too_large`.
- Rafforzata UI/read model prodotti: tabella con `Product id`, `State` e `Archived at`, includendo prodotti attivi e archiviati filtrati separatamente.
- Codex Security diff scan eseguito su Admin Web e Win7POS: nessun finding reportable sopravvissuto alla discovery; report locali in `/tmp/codex-security-scans/merchandise-control-admin-web/df6c2dc_20260601T145639Z_task028/report.md` e `/tmp/codex-security-scans/Win7POS/6efc672_20260601T145639Z_task028/report.md`.

## Rischi residui

- E2E live Supabase/Admin Web/Win7POS con dataset reale e cleanup non eseguito.
- Migrazione Supabase non applicata/verificata su DB locale o live: CLI presente (`2.102.0`), ma `supabase status` fallisce per container locale assente `supabase_db_merchandise-control-admin-web`; nessun apply remoto eseguito.
- File `.xls` legacy osservati nel Drive: lo scope implementato usa il parser `.xlsx` esistente; conversione o supporto `.xls` nativo richiede decisione/dipendenza separata.
- iOS: `NOT_TOUCHED / NOT_RUN`.
- Android: `NOT_TOUCHED / NOT_RUN`.

## Handoff

- Prossima fase: `REVIEW`.
- Verdict corrente: `READY_FOR_DONE_CONFIRMATION`.
- Codex non marca mai `DONE`; `DONE` richiede review positiva e conferma esplicita dell'utente.
