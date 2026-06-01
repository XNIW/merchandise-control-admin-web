# TASK-026 Evidence

## Stato corrente

- Task: `TASK-026 - Shop Admin product catalog foundation`
- Stato task: `DONE_WITH_NOTES`
- Fase: `DONE_WITH_NOTES`
- Data execution: `2026-06-01`
- Execution: `COMPLETED_BY_CODEX`
- Review: `COMPLETED_DONE_WITH_NOTES`
- Decisione finale: `DONE_WITH_NOTES`
- Commit: `NOT_RUN_USER_REQUESTED_NO_COMMIT`
- Push: `NOT_RUN_USER_REQUESTED_NO_PUSH`
- Stage: `NOT_RUN_USER_REQUESTED_NO_STAGE`

## Pre-flight checkpoint

| Repo | Comando | Esito | Evidence sintetica |
| --- | --- | --- | --- |
| Admin Web | `git status --short` | `PASS_WITH_EXISTING_CHANGES` | Presenti modifiche preesistenti a `.env.example`, Master Plan e docs TASK-022_023/TASK-026. |
| Admin Web | `git diff --check` | `PASS` | Nessun output. |
| Admin Web | `git diff --cached --name-status` | `PASS` | Nessun output. |
| Win7POS | `git status --short` | `PASS` | Nessun output; repo pulito prima delle modifiche TASK-026. |
| Win7POS | `git diff --check` | `PASS` | Nessun output. |
| Win7POS | `git diff --cached --name-status` | `PASS` | Nessun output. |

## Letture obbligatorie

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-026-shop-admin-product-catalog-foundation.md`
- `docs/TASKS/EVIDENCE/TASK-026/README.md`
- Guide locali Next.js in `node_modules/next/dist/docs/`:
  - App Router layouts/pages;
  - Server and Client Components;
  - Mutating Data;
  - Route Handlers;
  - Data Security;
  - Environment Variables.
- Codice catalogo Admin Web, schema Supabase e Win7POS online client/service indicati nel task.

## Discovery

Schema/RPC/tabelle reali verificate:

- `shop_inventory_sources.shop_id -> owner_user_id` e gate `mapping_state = 'mapped'`, `disabled_at is null`.
- `inventory_products`, `inventory_categories`, `inventory_suppliers` con `owner_user_id` e `deleted_at`.
- `inventory_product_prices` per storico prezzi catalogo.
- RPC `shop_catalog_create_product`, `shop_catalog_update_product`, `shop_catalog_archive_product`.
- RPC `shop_catalog_create_category`, `shop_catalog_update_category`, `shop_catalog_archive_category`.
- RPC `shop_catalog_create_supplier`, `shop_catalog_update_supplier`, `shop_catalog_archive_supplier`.
- Excel foundation gia presente tramite `src/server/shop-admin/import-export-workbook.ts` e route `/shop/import-export/*`.

## Modifiche Admin Web

- Aggiunto `src/app/api/pos/catalog/pull/route.ts`.
- Aggiunto `src/server/pos-auth/catalog-pull.ts`.
- Aggiunto test foundation `tests/foundation/task-026-shop-admin-catalog-foundation.test.mjs`.
- Aggiunti filtri `query` su `/shop/categories` e `/shop/suppliers`.
- Esteso `shop-section-data.ts` con `applyNamedCatalogFilter`.
- Aggiunta policy `docs/ARCHITECTURE/WIN7POS-SYNC-POLICY.md`.

## Modifiche Win7POS

- Esteso `PosAdminWebClient` con `CatalogPullAsync`.
- Aggiunto `PosCatalogPullService`.
- Agganciato pull catalogo dopo heartbeat trusted in `MainWindow.xaml.cs`.
- Aggiunto scanner `scripts/check-pos-catalog-pull.ps1`.
- Persistenza locale tramite `UpsertProductAndMetaInTransactionAsync`.

## Check eseguiti

| Repo | Comando | Esito | Evidence sintetica |
| --- | --- | --- | --- |
| Admin Web | `node --test tests/foundation/task-026-shop-admin-catalog-foundation.test.mjs` | `RED_THEN_PASS` | Primo run: 2 pass, 1 fail per policy mancante. Run finale: `tests 3`, `pass 3`, `fail 0`. |
| Admin Web | `npm run typecheck` | `PASS` | `next typegen` OK, `tsc --noEmit` OK. |
| Admin Web | `npm run lint` | `PASS` | Nessun output ESLint dopo header comando. |
| Admin Web | `npm run build` | `PASS_WITH_WARNING` | Compilazione OK; route `/api/pos/catalog/pull` presente. Warning Node `[DEP0205] module.register()` da toolchain. |
| Admin Web | `npm run security:scan` | `FAIL_THEN_PASS` | Primo run fallito per whitelist governance ferma a TASK-022_023 e route POS ammessi fino a TASK-021. Scanner aggiornato; run finale: `Security scan passed.` |
| Admin Web | `npm run test:foundation` | `FAIL_THEN_PASS` | Primo run: 111 pass, 5 fail per whitelist governance storiche. Run finale: `tests 116`, `pass 116`, `fail 0`. |
| Admin Web | `npm run verify` | `PASS_WITH_WARNING` | `lint`, `typecheck`, `security:scan` e `build` completati. Warning Node `[DEP0205]` durante `next build`. |
| Win7POS | `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-catalog-pull.ps1` | `PASS` | Tutti i gate PASS; `=== RESULT: ALL PASS ===`. |
| Win7POS | `dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Debug -p:PlatformTarget=x86` | `FAIL_COMMAND_SHAPE` | SourceGear SQLite ha letto `Platform=AnyCPU`; comando non valido per questo progetto. |
| Win7POS | `dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Debug -p:Platform=x86` | `PASS` | `Compilazione completata. Avvisi: 0. Errori: 0.` |
| Admin Web | `git diff --check` | `PASS` | Nessun output. |
| Admin Web | `git diff --cached --name-status` | `PASS` | Nessun output; nessun file staged. |
| Admin Web | `git status --short` | `PASS_WITH_CHANGES` | Modifiche TASK-026 presenti; `.env.example` e docs TASK-022_023 erano gia modificati prima dell'execution. |
| Win7POS | `git diff --check` | `PASS` | Nessun output. |
| Win7POS | `git diff --cached --name-status` | `PASS` | Nessun output; nessun file staged. |
| Win7POS | `git status --short` | `PASS_WITH_CHANGES` | Modificati solo file Win7POS TASK-026: client online, service pull catalogo, MainWindow e scanner. |

## Review finale / chiusura

- Decisione finale: `DONE_WITH_NOTES`.
- Data chiusura documentale: `2026-06-01`.
- Conferma utente: richiesta esplicita di finalizzare TASK-026 come `DONE_WITH_NOTES`.
- Esito review: nessun blocker trovato.
- Catalog pull Admin Web: server-only, `Cache-Control: no-store`, trusted-session/device scoped e shop-scoped tramite mapping `shop_inventory_sources -> owner_user_id`.
- Win7POS: pull catalogo read-only e persistenza locale; nessun editing remoto del catalogo.
- TASK-022_023: resta `PARKED_E2E_PENDING`.
- TASK-024 sales sync: resta `DEFERRED`.
- Commit/push/stage: `NOT_RUN`.

## Rischi residui

- E2E live Supabase + Admin Web + Win7POS non eseguito.
- Nessun delta sync: `syncCursor` e documentato ma TASK-026 usa `full_refresh`.
- Nessun editing catalogo da POS verso Supabase.
- Prezzi/stock Win7POS vanno validati con dataset reale prima di produzione.

## Handoff

- Prossima fase: `IDLE` / scelta del prossimo task.
- TASK-022_023 resta parcheggiato per E2E live.
- TASK-024 sales sync resta `DEFERRED`.
- Nessun commit, push o stage eseguito.
