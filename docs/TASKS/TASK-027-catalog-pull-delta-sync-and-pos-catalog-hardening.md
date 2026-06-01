# TASK-027 - Catalog pull delta sync and POS catalog hardening

## Informazioni generali

- ID: `TASK-027`
- Titolo: `Catalog pull delta sync and POS catalog hardening`
- Stato: `DONE`
- Fase attuale: `DONE_RECONCILED`
- Responsabile attuale: `USER_CONFIRMED_DONE`
- Data apertura: `2026-06-01`
- Execution: `COMPLETED_BY_CODEX`
- Review: `COMPLETED_BY_USER_CONFIRMATION`
- Verdict finale: `DONE_RECONCILED_WITH_NOTES`
- Commit: `REQUESTED_BY_USER_FINALIZATION`
- Git push: `REQUESTED_BY_USER_FINALIZATION`
- Stage: `REQUESTED_BY_USER_FINALIZATION`

## Contesto

TASK-026 ha introdotto il pull catalogo read-only per Win7POS come `full_refresh`.
TASK-027 consolida il contratto reale per pull/delta sync, senza sync bidirezionale, senza editing catalogo dal POS e senza purge distruttivo.

Admin Web/Supabase resta la sorgente principale. Il catalogo continua a essere shop-scoped tramite `shop_inventory_sources.shop_id -> owner_user_id`, con dati catalogo reali su `inventory_products`, `inventory_categories`, `inventory_suppliers` e storico prezzi `inventory_product_prices`.

## Contratto delta sync

Endpoint: `POST /api/pos/catalog/pull`.

Input supportato:

- trusted POS/session fields gia previsti da TASK-021/TASK-026;
- `updated_since` oppure `updatedSince`: timestamp ISO per delta sync;
- `syncCursor` / `sync_cursor` / `cursor`: cursor restituito dal server, compatibile anche con vecchi cursor timestamp;
- `limit` / `pageSize` / `page_size`: limite pagina, clamp server-side.

Output principale:

- `syncMode`: `full_refresh` senza cursor, `delta` con `updated_since` o cursor;
- `catalog.products/categories/suppliers/prices`;
- `catalog.tombstones.products/categories/suppliers`;
- `catalogVersion`: versione per risposta, deterministica sui record restituiti;
- `serverTime`: upper bound ordinabile usato dal server;
- `syncCursor`: prossimo cursor, timestamp se completo o cursor opaco se `hasMore`;
- `hasMore`: indica pagine residue;
- `updatedSince`: lower bound normalizzato o `null`.

Il contratto e idempotente: client possono upsertare righe attive e applicare tombstone per ID. Il server non richiede e non suggerisce purge locale globale.

## Cursor e paginazione

Il cursor usa `updated_at` per prodotti/categorie/fornitori e `created_at` legacy per prezzi. Per evitare buchi su collisioni timestamp, il delta usa lower bound inclusivo e upsert idempotente lato client.

Se una pagina supera il limite, `syncCursor` diventa un cursor opaco `catalog-v1:*` con upper bound e offset per entity. Quando tutte le entity sono complete, `syncCursor` torna a un timestamp ISO riutilizzabile come `updated_since`.

## Archived/deleted

Il modello reale usa `deleted_at` su:

- `inventory_products`;
- `inventory_categories`;
- `inventory_suppliers`.

Le RPC `shop_catalog_archive_*` aggiornano `deleted_at` e `updated_at`. TASK-027 non aggiunge migration per soft delete perche i campi indispensabili esistono gia. In full refresh iniziale il server invia righe attive; in delta invia anche tombstone aggiornate dopo il cursor.

## Diagnostica Admin Web

La vista Shop Admin `/shop/pos` mostra diagnostica reale derivata da `audit_logs`:

- ultimo catalog pull riuscito;
- `catalogVersion`;
- preview redatta del cursor ultimo sync;
- conteggio errori catalog pull recenti;
- stato `hasMore`.

Non e stata creata una dashboard cosmetica separata.

## Win7POS

Il client Win7POS esistente e stato aggiornato in modo minimale:

- salva `pos.catalog.last_sync_cursor`;
- invia il cursor salvato tramite `syncCursor`;
- mantiene `updated_since` come compatibilita per timestamp legacy;
- aggiunge retry/backoff leggero solo per errori transitori;
- non effettua purge locale;
- riceve le tombstone nel payload, ma senza cancellazione locale distruttiva perche il modello locale prodotti non ha ancora soft-delete catalogo.

## Review/fix 2026-06-01

Durante la review richiesta dall'allegato sono stati trovati e corretti tre gap:

1. `syncCursor` opaco `catalog-v1:*`: il parser ora respinge `upperBound` futuro rispetto al server e cursor con `lowerBound > upperBound`.
2. Audit catalog pull: `metadata_redacted` non salva piu il cursor completo; salva solo `sync_cursor_present` e `sync_cursor_preview`.
3. Win7POS: il cursor opaco salvato non viene piu reinviato come `updated_since`; viene serializzato nel campo wire `syncCursor`.

Security diff scan Codex completato su Admin Web e Win7POS:

- report Admin Web: `/tmp/codex-security-scans/merchandise-control-admin-web/6836195_20260601T134010Z_task027/report.md`
- report Win7POS: `/tmp/codex-security-scans/Win7POS/60f10de_20260601T134010Z_task027/report.md`
- verdict security: nessun finding reportable non risolto dopo fix/validation/attack-path.

## Non incluso

- Sync bidirezionale catalogo.
- Editing catalogo dal POS.
- Login POS completo.
- TASK-024 sales sync.
- Nuove dashboard finte o metriche inventate.
- Nuove dipendenze.
- Migration Supabase, perche schema e tipi hanno gia `deleted_at` / `updated_at` necessari.
- Commit, push o stage automatici durante execution; finalization commit/push richiesti esplicitamente dall'utente il 2026-06-01.

## File toccati

### Admin Web

- `src/server/pos-auth/catalog-sync-contract.ts`
- `src/server/pos-auth/catalog-pull.ts`
- `src/server/shop-admin/pos-live-read-model.ts`
- `src/server/shop-admin/shop-section-data.ts`
- `tests/foundation/task-027-catalog-pull-delta-sync.test.mjs`
- `docs/ARCHITECTURE/WIN7POS-SYNC-POLICY.md`
- `docs/TASKS/TASK-027-catalog-pull-delta-sync-and-pos-catalog-hardening.md`
- `docs/TASKS/EVIDENCE/TASK-027/README.md`
- `docs/MASTER-PLAN.md`
- `scripts/security-checks.mjs`

### Win7POS

- `/Users/minxiang/Projects/Win7POS/src/Win7POS.Wpf/Pos/Online/PosAdminWebClient.cs`
- `/Users/minxiang/Projects/Win7POS/src/Win7POS.Wpf/Pos/Online/PosCatalogPullService.cs`
- `/Users/minxiang/Projects/Win7POS/scripts/check-pos-catalog-pull.ps1`

## Criteri di accettazione

| CA | Descrizione | Stato |
|---|---|---|
| CA-01 | Delta pull implementato su codice reale. | `PASS` |
| CA-02 | `updated_since` / cursor funziona con test mirato. | `PASS` |
| CA-03 | Archived/deleted handling con tombstone coperto. | `PASS` |
| CA-04 | Nessun purge distruttivo. | `PASS` |
| CA-05 | `catalogVersion` presente e documentato. | `PASS` |
| CA-06 | Diagnostica reale Shop Admin presente. | `PASS` |
| CA-07 | Isolamento shop tramite `owner_user_id` mappato e trusted session. | `PASS` |
| CA-08 | Evidence e Master Plan aggiornati. | `PASS` |
| CA-09 | Cursor opaco e audit metadata validati post-review. | `PASS` |

## Rischi residui

- Nessun E2E live Supabase + Admin Web + Win7POS con dataset reale e cleanup e stato eseguito in TASK-027.
- `catalogVersion` e per risposta sync, non ancora versione persistente per shop.
- `inventory_product_prices.created_at` resta un timestamp testuale legacy; il delta prezzi usa confronto coerente con il formato storico.
- Win7POS riceve tombstone ma non cancella ne archivia localmente per evitare purge distruttivo finche non esiste un modello locale soft-delete.
- I report security sono locali in `/tmp/codex-security-scans`; non sono stati committati nel repository.

## Handoff

- Prossima fase: `DONE_RECONCILED`.
- Verdict finale: `DONE_RECONCILED_WITH_NOTES`.
- Chiuso su conferma esplicita utente del 2026-06-01 dopo review/fix, cleanup artefatti, check finali e richiesta commit/push separati.
