# TASK-028 Evidence

## Stato corrente

- Task: `TASK-028 - Catalog CRUD, Excel import/export, and Win7POS catalog pull E2E`
- Stato task: `DONE_RECONCILED_WITH_NOTES`
- Fase: `DONE_RECONCILED`
- Data execution: `2026-06-01`
- Execution: `COMPLETED_BY_CODEX`
- Review: `USER_CONFIRMED_DONE`
- Verdict corrente: `DONE_RECONCILED_WITH_NOTES`
- Commit: `NOT_REQUESTED`
- Push: `NOT_REQUESTED`
- Stage: `NOT_REQUESTED`
- Chiusura registrata su conferma esplicita dell'utente nel brief `TASK-029`

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

## Review live Supabase + Win7POS E2E 2026-06-01

Ambiente usato:

- Produzione/remoto: `NOT_USED`. La `.env.local` Admin Web punta a un URL Supabase remoto ed e stata esclusa dal run E2E.
- Stack locale gia attivo: `MerchandiseControlSupabase` su `127.0.0.1:54321/54322`, ispezionato ma non modificato perche la migration history e divergente (`20260417` legacy nel DB contro `20260417000000` nella repo).
- Stack E2E isolato: copia temporanea Supabase in `/tmp/mc-task028-supabase.6OZZEG`, `project_id = mc-task028-e2e`, API `http://127.0.0.1:55431`, DB `127.0.0.1:55432`, Studio `55433`, analytics `55437`.
- Workaround locale temporaneo, non applicato alla repo: nella copia `/tmp` la migration storica `20260515161500_task110_history_tombstone_grants.sql` e stata resa idempotente per `public.product_prices` assente, per permettere un fresh stack fino a TASK-028. Il file TASK-028 originale non e stato modificato.

Migration / schema:

| Check | Esito | Evidence sintetica |
| --- | --- | --- |
| `supabase --workdir /tmp/mc-task028-supabase.6OZZEG start` | `PASS_WITH_NOTES` | Fresh stack locale avviato dopo workaround temporaneo su TASK-110 e porta analytics. Output migration include `Applying migration 20260601160000_task_028_catalog_restore_product.sql`. |
| `select version, name from supabase_migrations.schema_migrations order by version desc limit 8` | `PASS` | Ultima migration: `20260601160000 task_028_catalog_restore_product`. |
| Check RPC/trigger | `PASS` | `restore_rpc_exists = true`, `products_updated_trigger = true`, `resolve_owner_exists = true`. |
| `psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260601160000_task_028_catalog_restore_product.sql` | `PASS` | File TASK-028 originale rieseguito sul DB isolato: `BEGIN`, `CREATE FUNCTION` x3, `REVOKE`, `GRANT`, `NOTIFY`, `COMMIT`. |

Dati test sintetici:

- Auth/profile/shop locale: user id `84d8149a-a8cc-4cd3-80a8-fd7aa33e763f`, shop id `bb734062-8421-4a70-968b-f6d7b9cc463e`, shop code `T28MPVIGZPH`.
- Membership: `shop_owner` attiva.
- Inventory mapping: `shop_inventory_sources.mapping_state = mapped`, `owner_user_id = user id`.
- Staff POS: `POS028`, `status = active`, `credential_status = active`.
- Prodotto importato: id `9e09c29c-de7e-4324-aaa6-5a7e724e4c52`, barcode `8800000000281`.

E2E Admin Web -> POS:

| Flusso | Esito | Evidence sintetica |
| --- | --- | --- |
| Admin Web import `.xlsx` preview | `PASS` | Route reale `POST /shop/import-export/preview` su Admin Web temporaneo `127.0.0.1:3007`; `status 200`, `ok true`, `code success`, summary `products 1`, `newProducts 1`, `errors 0`. |
| Admin Web import `.xlsx` apply | `PASS` | Route reale `POST /shop/import-export/apply`; `status 200`, `ok true`, `productsApplied 1`, `failedRows 0`. |
| POS first login | `PASS` | `POST /api/pos/auth/first-login`; `status 200`, trusted device creato `fc12a2c0-52e7-4cb7-860b-783d21d56fe2`, sessione `86db5a66-b5ae-4cc3-aa26-22171d0ce272`. |
| POS catalog full pull | `PASS` | `POST /api/pos/catalog/pull`; `syncMode full_refresh`, `schemaVersion 2`, `products 1`, `productTombstones 0`, `hasMore false`, prodotto importato presente. |
| Admin Web archive via UI/Server Action | `PASS` | Playwright su `/shop/products`; form `Archive product` con conferma `ARCHIVE`; redirect `action=success&result=success`; DB `deleted_at = 2026-06-01T18:01:38.932169+00:00`. |
| POS delta tombstone | `PASS` | Pull con cursor precedente; `syncMode delta`, `products 0`, `productTombstones 1`, tombstone prodotto `9e09c29c-de7e-4324-aaa6-5a7e724e4c52`. |
| Win7POS soft tombstone locale | `PASS` | Harness temporaneo fuori repo referenziando `Win7POS.Data`/`Core`; DB `/tmp/mc-task028-win7pos-data/pos.db`; prima `isActive 1`, dopo `tombstoneApplied true`, `isActive 0`, `remoteDeletedAt` valorizzato. |
| Admin Web restore via UI/Server Action | `PASS` | Playwright su `/shop/products`; form `Restore product` con conferma `RESTORE`; redirect `action=success&result=success`; DB `deleted_at = null`, `updated_at = 2026-06-01T18:05:08.410746+00:00`. |
| POS delta dopo restore + Win7POS re-activate | `PASS` | Pull con cursor tombstone; `syncMode delta`, `products 1`, `productTombstones 0`; upsert Win7POS su stesso DB test riporta `isActive 1` e `remoteDeletedAt null`. |

Check richiesti rieseguiti dopo E2E:

| Repo | Comando | Esito | Evidence sintetica |
| --- | --- | --- | --- |
| Admin Web | `npm run test:foundation` | `PASS` | `tests 128`, `pass 128`, `fail 0`, `duration_ms 436.938167`. |
| Admin Web | `npm run verify` | `PASS_WITH_WARNING` | `lint`, `typecheck`, `security:scan`, `build` passati. Warning build Node `[DEP0205] module.register()` da toolchain. |
| Admin Web | `npm run security:scan` | `PASS` | `Security scan passed.` |
| Admin Web | `git diff --check` | `PASS` | Nessun output. |
| Win7POS | `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-catalog-pull.ps1` | `PASS` | Tutti i gate PASS; `=== RESULT: ALL PASS ===`. |
| Win7POS | `dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Debug -p:Platform=x86` | `PASS` | `Avvisi: 0`, `Errori: 0`, output `Win7POS.Wpf.exe` in `bin/x86/Debug/net48`. |
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
- Apply/verify TASK-028: `PASS_WITH_NOTES` su stack Supabase locale isolato `/tmp/mc-task028-supabase.6OZZEG`; la migration risulta in `supabase_migrations.schema_migrations` come `20260601160000 task_028_catalog_restore_product`, la RPC `shop_catalog_restore_product` esiste e il file SQL originale TASK-028 e stato rieseguito con `psql` senza errori.
- Produzione/live remoto: `NOT_USED`.
- Nota: un fresh stack non patchato si ferma prima di TASK-028 su migration storica `20260515161500_task110_history_tombstone_grants.sql` per `public.product_prices` assente. La review E2E ha applicato un workaround solo nella copia temporanea `/tmp`, non nel repository.

## Rischi residui

- Fresh reset Supabase non patchato dalla repo restava bloccato prima di TASK-028 dalla migration storica `20260515161500_task110_history_tombstone_grants.sql` (`public.product_prices` assente). Correzione trattata in `TASK-029`.
- File `.xls` legacy presenti nel Drive fornitori: non e stata aggiunta una nuova dipendenza per parsing `.xls` nativo; i campioni `.xlsx` sono stati usati per riconoscimento colonne e l'upload resta dichiarato/limitato a `.xlsx`.
- Restore prodotto puo restituire `conflict` se un prodotto attivo dello stesso shop ha gia lo stesso barcode.
- Android/iOS non toccati.
- TASK-024 sales sync deferred.

## DONE reconciliation 2026-06-01

- L'utente ha confermato esplicitamente nel brief `TASK-029` che `TASK-028` puo essere chiuso.
- Stato finale: `DONE_RECONCILED_WITH_NOTES`.
- La chiusura si basa sulla verifica live PASS gia registrata: migration TASK-028 su stack isolato, RPC restore, import `.xlsx`, first-login/catalog pull POS, archive/tombstone/restore e check Admin Web/Win7POS.
- Nessuna produzione usata e nessuna dichiarazione di readiness globale.

## Handoff

- Prossima fase: `DONE_RECONCILED`.
- Fase attuale: `DONE_RECONCILED`
- Verdict corrente: `DONE_RECONCILED_WITH_NOTES`
- Conferma esplicita utente registrata.
