# TASK-027 Evidence

## Stato corrente

- Task: `TASK-027 - Catalog pull delta sync and POS catalog hardening`
- Stato task: `DONE`
- Fase: `DONE_RECONCILED`
- Data execution: `2026-06-01`
- Execution: `COMPLETED_BY_CODEX`
- Review: `COMPLETED_BY_USER_CONFIRMATION`
- Verdict finale: `DONE_RECONCILED_WITH_NOTES`
- Commit: `REQUESTED_BY_USER_FINALIZATION`
- Push: `REQUESTED_BY_USER_FINALIZATION`
- Stage: `REQUESTED_BY_USER_FINALIZATION`

## Letture obbligatorie

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-026-shop-admin-product-catalog-foundation.md`
- `docs/TASKS/EVIDENCE/TASK-026/README.md`
- Guide Next locali:
  - `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
  - `node_modules/next/dist/docs/01-app/02-guides/data-security.md`
- Schema/migration catalogo:
  - `supabase/migrations/20260417120000_task013_inventory_catalog_rls.sql`
  - `supabase/migrations/20260418200000_task019_inventory_catalog_tombstone.sql`
  - `supabase/migrations/20260509120000_task086_inventory_catalog_updated_at_triggers.sql`
  - `supabase/migrations/20260417200000_task016_inventory_product_prices.sql`
  - `supabase/migrations/20260531171726_task_015_shop_admin_completion.sql`
- Codice catalogo/POS Admin Web e Win7POS esistente.

## Discovery

Campi reali verificati:

- `shop_inventory_sources.shop_id`, `owner_user_id`, `mapping_state`, `disabled_at`;
- `shops.shop_id`, `shop_code`, `shop_status`;
- `inventory_products.owner_user_id`, `updated_at`, `deleted_at`;
- `inventory_categories.owner_user_id`, `updated_at`, `deleted_at`;
- `inventory_suppliers.owner_user_id`, `updated_at`, `deleted_at`;
- `inventory_product_prices.owner_user_id`, `product_id`, `created_at`;
- RPC `shop_catalog_archive_*` aggiornano `deleted_at` e `updated_at`.

Non e stata aggiunta migration: i campi indispensabili per `updated_since`, tombstone e shop isolation sono gia presenti.

## Modifiche

- Aggiunto helper testabile `catalog-sync-contract.ts` per `updated_since`, cursor, pagination e `catalogVersion`.
- Esteso `POST /api/pos/catalog/pull`:
  - validazione `updated_since`;
  - `syncMode` `full_refresh`/`delta`;
  - `serverTime`;
  - `hasMore`;
  - `syncCursor`;
  - `catalogVersion`;
  - tombstone per prodotti/categorie/fornitori;
  - no purge distruttivo.
- Estesa diagnostica `/shop/pos` da audit reali `pos.catalog.pull.*`.
- Esteso Win7POS esistente con cursor salvato e retry/backoff leggero.
- Aggiornata policy `docs/ARCHITECTURE/WIN7POS-SYNC-POLICY.md` da foundation `full_refresh` a contratto delta/tombstone.
- Aggiunto test mirato `tests/foundation/task-027-catalog-pull-delta-sync.test.mjs`.
- Rafforzato il test cursor per respingere cursor opachi `catalog-v1:*` con `lowerBound` invalido.
- Review/fix allegato 2026-06-01:
  - cursor opachi `catalog-v1:*` con `upperBound` futuro o `lowerBound > upperBound` respinti;
  - audit `pos.catalog.pull.success` senza cursor completo in `metadata_redacted`, solo `sync_cursor_present` e `sync_cursor_preview`;
  - Win7POS invia il cursor salvato tramite `syncCursor`, non tramite `updated_since`.

## Contratto

- Input: `updated_since`, `updatedSince`, `syncCursor`, `sync_cursor`, `cursor`, `limit`, `pageSize`, `page_size`.
- Output: `catalogVersion`, `serverTime`, `syncCursor`, `hasMore`, `updatedSince`, `catalog.tombstones`.
- Semantica deleted/archive: `deleted_at` diventa tombstone nel delta; nessuna cancellazione fisica.
- Semantica cursor: `syncCursor` e il campo wire per cursor server opachi o timestamp; `updated_since` resta compatibilita timestamp.
- Semantica no purge distruttivo: server restituisce delta e tombstone idempotenti, Win7POS fa upsert e non svuota catalogo locale.

## Codex Security diff scan

Security scan locale completato su entrambi i repo:

| Repo | Report Markdown | Report HTML | Esito |
| --- | --- | --- | --- |
| Admin Web | `/tmp/codex-security-scans/merchandise-control-admin-web/6836195_20260601T134010Z_task027/report.md` | `/tmp/codex-security-scans/merchandise-control-admin-web/6836195_20260601T134010Z_task027/report.html` | `PASS_NO_REPORTABLE_FINDINGS_AFTER_FIX` |
| Win7POS | `/tmp/codex-security-scans/Win7POS/60f10de_20260601T134010Z_task027/report.md` | `/tmp/codex-security-scans/Win7POS/60f10de_20260601T134010Z_task027/report.html` | `PASS_NO_REPORTABLE_FINDINGS_AFTER_FIX` |

Candidate chiuse con discovery, validation e attack-path receipt:

- `TASK027-CURSOR-VALIDATION`: fix parser cursor opaco futuro/incoerente.
- `TASK027-AUDIT-CURSOR-REDACTION`: fix audit metadata cursor preview-only.
- `TASK027-WIN7POS-SYNC-CURSOR-WIRE`: fix request Win7POS `syncCursor`.

Cleanup artefatti finalization:

- nessuna cartella `/tmp/codex-security-scans/...` o `6836195_20260601T134010Z_task027`/`60f10de_20260601T134010Z_task027` trovata dentro i repo Admin Web o Win7POS;
- in `docs/TASKS/EVIDENCE/TASK-027/` resta solo `README.md`;
- i report completi restano fuori repository in `/tmp/codex-security-scans/...`.

## Check eseguiti

| Repo | Comando | Esito | Evidence sintetica |
| --- | --- | --- | --- |
| Admin Web | `git status --short --branch` | `INFO_DIRTY_PREEXISTING_AND_TASK027` | Branch `main`; working tree con modifiche TASK-027 gia presenti piu fix review, nessuno stage. |
| Admin Web | `node --test tests/foundation/task-027-catalog-pull-delta-sync.test.mjs` | `RED_THEN_PASS` | Primo run RED per helper, servizio, diagnostica e docs mancanti. Run finale: `tests 6`, `pass 6`, `fail 0`. |
| Admin Web | `npm run verify` lint step | `PASS` | `eslint` senza output di errore. |
| Admin Web | `npm run verify` typecheck step | `PASS` | `next typegen` OK, `tsc --noEmit` OK. |
| Admin Web | package script `test` lookup | `NOT_AVAILABLE` | Script non presente in `package.json`; usare `npm run test:foundation`. |
| Admin Web | `npm run security:scan` | `PASS` | `Security scan passed.` |
| Admin Web | `npm run test:foundation` | `PASS` | `tests 122`, `pass 122`, `fail 0`. |
| Admin Web | `npm run verify` | `PASS_WITH_WARNING` | `lint`, `typecheck`, `security:scan`, `build` passati. Warning build Node `[DEP0205] module.register()` da toolchain. |
| Admin Web | `npm run verify` build step | `PASS_WITH_WARNING_VIA_VERIFY` | Build Next inclusa in `verify`; route `/api/pos/catalog/pull` compilata. |
| Admin Web | `git diff --check` | `PASS` | Nessun output. |
| Win7POS | `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-catalog-pull.ps1` | `PASS` | Tutti i gate PASS; `=== RESULT: ALL PASS ===`. |
| Win7POS | `dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Debug -p:Platform=x86` | `PASS` | `Avvisi: 0`, `Errori: 0`. |
| Win7POS | `git diff --check` | `PASS` | Nessun output. |

## Stato Git pre-finalization commit

Admin Web:

```text
## main...origin/main [ahead 1]
 M docs/ARCHITECTURE/WIN7POS-SYNC-POLICY.md
 M docs/MASTER-PLAN.md
 M scripts/security-checks.mjs
 M src/server/pos-auth/catalog-pull.ts
 M src/server/shop-admin/pos-live-read-model.ts
 M src/server/shop-admin/shop-section-data.ts
 M tests/foundation/admin-web-ui-polish.test.mjs
 M tests/foundation/task-014-pos-staff-foundation.test.mjs
 M tests/foundation/task-018-infrastructure-security-pos-foundation.test.mjs
 M tests/foundation/task-020-win7pos-integration-planning.test.mjs
 M tests/foundation/task-022-023-pos-dashboard-win7pos-client.test.mjs
 M tests/foundation/task-026-shop-admin-catalog-foundation.test.mjs
?? docs/TASKS/EVIDENCE/TASK-027/
?? docs/TASKS/TASK-027-catalog-pull-delta-sync-and-pos-catalog-hardening.md
?? src/server/pos-auth/catalog-sync-contract.ts
?? tests/foundation/task-027-catalog-pull-delta-sync.test.mjs
```

Win7POS:

```text
## main...origin/main [ahead 1]
 M scripts/check-pos-catalog-pull.ps1
 M src/Win7POS.Wpf/Pos/Online/PosAdminWebClient.cs
 M src/Win7POS.Wpf/Pos/Online/PosCatalogPullService.cs
```

## Rischi residui

- E2E live Supabase/Admin Web/Win7POS non eseguito.
- `catalogVersion` e per risposta, non persistente per shop.
- Delta prezzi si basa su `inventory_product_prices.created_at` legacy testuale.
- Tombstone Win7POS ricevute ma non applicate come cancellazione locale, per evitare purge in assenza di soft-delete locale.
- I report security sono locali in `/tmp/codex-security-scans`; non sono stati committati nel repository.

## Handoff

- Prossima fase: `DONE_RECONCILED`.
- Verdict finale: `DONE_RECONCILED_WITH_NOTES`.
- Chiuso su conferma esplicita utente del 2026-06-01 dopo review/fix, cleanup artefatti e richiesta commit/push separati.
