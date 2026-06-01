# TASK-028 Evidence

## Stato corrente

- Task: `TASK-028 - Catalog CRUD, Excel import/export, and Win7POS catalog pull E2E`
- Stato task: `REVIEW`
- Fase: `REVIEW`
- Data execution: `2026-06-01`
- Execution: `COMPLETED_BY_CODEX`
- Review: `PENDING_USER_REVIEW`
- Verdict corrente: `READY_FOR_DONE_CONFIRMATION`
- Commit: `NOT_REQUESTED`
- Push: `NOT_REQUESTED`
- Stage: `NOT_REQUESTED`
- Codex non marca mai `DONE`

## Baseline TASK-027

- Admin Web: `git status --short` -> clean
- Admin Web: `git diff --check` -> clean
- Win7POS: `git status --short` -> clean
- Win7POS: `git diff --check` -> clean

## Letture obbligatorie

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-026-shop-admin-product-catalog-foundation.md`
- `docs/TASKS/TASK-027-catalog-pull-delta-sync-and-pos-catalog-hardening.md`
- `docs/TASKS/EVIDENCE/TASK-027/README.md`
- `docs/ARCHITECTURE/WIN7POS-SYNC-POLICY.md`
- Guide Next locali:
  - `node_modules/next/dist/docs/01-app/02-guides/forms.md`
  - `node_modules/next/dist/docs/03-api-reference/01-directives/use-server.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
  - `node_modules/next/dist/docs/01-app/02-guides/data-security.md`
  - `node_modules/next/dist/docs/03-api-reference/01-directives/use-client.md`

## Drive fornitori

Cartella fornitori fornita dall'utente:

- `Vs20260519-456(Dingli).xlsx`: header rilevato dopo metadata ordine/cliente; colonne `产品货号`, `条码`, `产品名1`, `产品名2`, `数量`, `单价`, `售价`.
- `20260520-Xianzhu.xlsx`: header immediato con `Código Producto`, `Nombre Producto`, `Cantidad`, `Precio`, `Código de Barra`.
- `Vs20260516-2(River Richer).xlsx`: header cinese con colonne extra come `小包装数`.

Risultato: il parser cerca header per alias e supporta i due formati osservati senza applicare purge.

## Modifiche

Admin Web:

- aggiunto `catalog-import-contract.ts` con alias colonne, detection header, validazione duplicati/conflitti e merge conservativo;
- `import-export-workbook.ts` usa detection header, preview digest, validazione shop-scoped e apply non distruttivo;
- `import-export-workbook.ts` separa i permessi audit `catalog.import` / `catalog.export` e fallisce chiuso se audit/context non passa;
- route preview/apply bloccano `Content-Length` oltre `MAX_IMPORT_BYTES` prima del parsing multipart;
- aggiunta RPC `shop_catalog_restore_product` con `set_config('app.catalog_restore_allowed', 'true', true)`, audit e gestione `unique_violation`;
- aggiunto restore product nelle Server Actions e nel pannello catalogo;
- `inventory-read-model.ts` espone `deletedAt` e `archivedProducts`;
- `shop-section-data.ts` mostra metrica `Archived products`, righe attive/archiviate filtrate e colonne `Product id`, `State`, `Archived at`.

Win7POS:

- prodotti locali estesi con `remote_product_id`, `remote_deleted_at`, `is_active`;
- upsert catalog pull salva `remote_product_id` e riattiva righe aggiornate;
- tombstone prodotto applicate come soft state locale `is_active = 0`, senza delete fisico;
- diagnostica catalog pull salvata in `app_settings`: cursor, error, updated products, tombstone ricevute/applicate, hasMore, catalogVersion.

## Check eseguiti

| Repo | Comando | Esito | Evidence sintetica |
| --- | --- | --- | --- |
| Admin Web | `node --test tests/foundation/task-028-catalog-crud-import-export-win7pos-e2e.test.mjs` | `RED_THEN_PASS` | Run review RED per audit import/export, guard upload e archived products. Run finale: `tests 6`, `pass 6`, `fail 0`. |
| Admin Web | `node --test tests/foundation/task-026-shop-admin-catalog-foundation.test.mjs tests/foundation/task-027-catalog-pull-delta-sync.test.mjs tests/foundation/task-028-catalog-crud-import-export-win7pos-e2e.test.mjs` | `PASS` | `tests 15`, `pass 15`, `fail 0`, `duration_ms 555.202083`. |
| Admin Web | `npm run test:foundation` | `PASS` | Run intermedio FAIL per assertion legacy su `PASS_WITH_NOTES`; dopo aggiornamento harness verdict `READY_FOR_DONE_CONFIRMATION`, run finale `tests 128`, `pass 128`, `fail 0`, `duration_ms 600.391375`. |
| Admin Web | `npm run typecheck` | `PASS` | `next typegen` -> `Types generated successfully`; `tsc --noEmit` senza errori. |
| Admin Web | `npm run verify` | `PASS_WITH_WARNING` | `lint`, `typecheck`, `security:scan`, `build` passati. Warning build Node `[DEP0205] module.register()` da toolchain. |
| Admin Web | `npm run security:scan` | `PASS` | `Security scan passed.` |
| Admin Web | `git diff --check` | `PASS` | Nessun output. |
| Admin Web | `supabase --version` | `PASS` | CLI Supabase `2.102.0` disponibile. |
| Admin Web | `supabase status` | `BLOCKED_LOCAL_NOT_RUNNING` | `No such container: supabase_db_merchandise-control-admin-web`; nessuna migrazione applicata su DB locale/live. |
| Win7POS | `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-catalog-pull.ps1` | `PASS` | Tutti i gate PASS; `=== RESULT: ALL PASS ===`. |
| Win7POS | `dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Debug -p:Platform=x86` | `PASS` | `Avvisi: 0`, `Errori: 0`. |
| Win7POS | `git diff --check` | `PASS` | Nessun output. |

## Security diff scan

- Admin Web report: `/tmp/codex-security-scans/merchandise-control-admin-web/df6c2dc_20260601T145639Z_task028/report.md`
- Admin Web HTML: `/tmp/codex-security-scans/merchandise-control-admin-web/df6c2dc_20260601T145639Z_task028/report.html`
- Win7POS report: `/tmp/codex-security-scans/Win7POS/6efc672_20260601T145639Z_task028/report.md`
- Win7POS HTML: `/tmp/codex-security-scans/Win7POS/6efc672_20260601T145639Z_task028/report.html`
- Esito: nessun finding tecnicamente plausibile/reportable sopravvissuto alla discovery; validation/attack path non necessari.

## Stato app mobile

- iOS: `NOT_TOUCHED / NOT_RUN`
- Android: `NOT_TOUCHED / NOT_RUN`

## Supabase migration status

- Migrazione aggiunta: `supabase/migrations/20260601160000_task_028_catalog_restore_product.sql`.
- Check statici e foundation coprono presenza RPC, boundary e scanner sicurezza.
- Apply/verify su DB locale/live: `NOT_RUN`, perche l'ambiente Supabase locale non e avviato (`supabase status` -> container locale assente) e non e stato eseguito alcun apply remoto.

## Rischi residui

- E2E live Supabase/Admin Web/Win7POS con dataset reale e cleanup non eseguito.
- File `.xls` legacy presenti nel Drive fornitori: non e stata aggiunta una nuova dipendenza per parsing `.xls` nativo; i campioni `.xlsx` sono stati usati per riconoscimento colonne e l'upload resta dichiarato/limitato a `.xlsx`.
- Restore prodotto puo restituire `conflict` se un prodotto attivo dello stesso shop ha gia lo stesso barcode.

## Handoff

- Prossima fase: `REVIEW`.
- Fase attuale: `REVIEW`
- Verdict corrente: `READY_FOR_DONE_CONFIRMATION`
- Codex non marca mai `DONE`; chiusura richiede conferma esplicita utente.
