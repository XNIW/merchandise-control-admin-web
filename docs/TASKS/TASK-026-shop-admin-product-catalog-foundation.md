# TASK-026 - Shop Admin product catalog foundation

## Informazioni generali

- ID: `TASK-026`
- Titolo: `Shop Admin product catalog foundation`
- Stato: `DONE_WITH_NOTES`
- Fase attuale: `DONE_WITH_NOTES`
- Responsabile attuale: `COMPLETE`
- Data apertura: `2026-06-01`
- Execution: `COMPLETED_BY_CODEX`
- Review: `COMPLETED_DONE_WITH_NOTES`
- Commit: `NOT_ALLOWED_UNLESS_REQUESTED_LATER`
- Git push: `NOT_ALLOWED_UNLESS_REQUESTED_LATER`
- Stage: `NOT_ALLOWED_UNLESS_REQUESTED_LATER`

## Contesto

TASK-022_023 resta parcheggiato in `PASS_WITH_NOTES_READY_FOR_REVIEW` per il solo gate E2E live Supabase + Admin Web + Win7POS + dataset test + cleanup. TASK-024 sales sync resta differito.

TASK-026 consolida la foundation catalogo Shop Admin sullo schema reale gia presente da TASK-015/TASK-017 e aggiunge una base pull read-only per Win7POS. Non introduce nuove tabelle, nuove dipendenze o sync vendite.

## Scope eseguito

- Discovery schema reale:
  - `shop_inventory_sources`;
  - `inventory_products`;
  - `inventory_categories`;
  - `inventory_suppliers`;
  - `inventory_product_prices`;
  - RPC `shop_catalog_create_*`, `shop_catalog_update_*`, `shop_catalog_archive_*`.
- Verifica/hardening liste catalogo:
  - `/shop/products` conserva query/categoria/fornitore;
  - `/shop/categories` ora espone filtro query;
  - `/shop/suppliers` ora espone filtro query.
- Endpoint Admin Web:
  - `POST /api/pos/catalog/pull`;
  - validazione trusted POS server-side;
  - risposta `full_refresh` shop-scoped;
  - audit `pos.catalog.pull.*`;
  - `Cache-Control: no-store`.
- Win7POS:
  - client `CatalogPullAsync`;
  - servizio `PosCatalogPullService`;
  - persistenza locale con `ProductRepository.UpsertProductAndMetaInTransactionAsync`;
  - salvataggio `pos.catalog.last_sync_at`;
  - aggancio dopo heartbeat trusted riuscito.
- Policy:
  - `docs/ARCHITECTURE/WIN7POS-SYNC-POLICY.md`.

## Non incluso

- E2E live TASK-022_023.
- TASK-024 sales sync.
- Sync vendite, pagamenti, chiusure cassa o dashboard vendite.
- Editing catalogo da Win7POS verso Supabase.
- Nuove tabelle Supabase.
- Nuove dipendenze.
- Dati finti o seed persistenti.
- Commit, push o stage automatici.

## File toccati

### Admin Web

- `src/app/api/pos/catalog/pull/route.ts`
- `src/app/shop/categories/page.tsx`
- `src/app/shop/suppliers/page.tsx`
- `src/server/pos-auth/catalog-pull.ts`
- `src/server/shop-admin/shop-section-data.ts`
- `tests/foundation/task-026-shop-admin-catalog-foundation.test.mjs`
- `docs/ARCHITECTURE/WIN7POS-SYNC-POLICY.md`
- `docs/TASKS/TASK-026-shop-admin-product-catalog-foundation.md`
- `docs/TASKS/EVIDENCE/TASK-026/README.md`
- `docs/MASTER-PLAN.md`

### Win7POS

- `/Users/minxiang/Projects/Win7POS/src/Win7POS.Wpf/Pos/Online/PosAdminWebClient.cs`
- `/Users/minxiang/Projects/Win7POS/src/Win7POS.Wpf/Pos/Online/PosCatalogPullService.cs`
- `/Users/minxiang/Projects/Win7POS/src/Win7POS.Wpf/MainWindow.xaml.cs`
- `/Users/minxiang/Projects/Win7POS/scripts/check-pos-catalog-pull.ps1`

## Criteri di accettazione

| CA | Descrizione | Stato |
|---|---|---|
| CA-01 | Schema catalogo reale identificato e documentato senza inventare tabelle. | `PASS` |
| CA-02 | Read model catalogo resta `server-only`, shop-scoped e filtrato tramite mapping `shop_inventory_sources -> owner_user_id`. | `PASS` |
| CA-03 | Pagine prodotti/categorie/fornitori mostrano dati reali o stati safe e hanno filtri base. | `PASS` |
| CA-04 | Mutazioni catalogo restano su Server Actions/RPC auditabili; POS pull e read-only. | `PASS` |
| CA-05 | Nessun secret, token, PIN, password, service-role client/browser o `credential_hash` esposto. | `PASS` |
| CA-06 | Win7POS riceve solo catalog pull read-only; nessun sales sync. | `PASS` |
| CA-07 | Evidence finale include file toccati, check reali, rischi residui e prossima fase. | `PASS_WITH_NOTES` |

## Evidence

Evidence completa: `docs/TASKS/EVIDENCE/TASK-026/README.md`.

## Decisione finale review

- Decisione finale: `DONE_WITH_NOTES`.
- Data decisione: `2026-06-01`.
- Conferma utente: richiesta esplicita di finalizzare TASK-026 come `DONE_WITH_NOTES`.
- Motivo: review positiva senza blocker; catalog pull Admin Web server-only/no-store/trusted-session/device scoped; Win7POS pull read-only; nessun sales sync; nessun editing catalogo da POS.
- Note non bloccanti: E2E live non eseguito, pull `full_refresh` non delta, prezzi/stock da validare con dataset reale.
- TASK-022_023: resta `PARKED_E2E_PENDING`.
- TASK-024 sales sync: resta `DEFERRED`.

## Rischi residui

- L'E2E live Supabase + Admin Web + Win7POS resta non eseguito per TASK-026.
- Il pull catalogo e `full_refresh`; il `sync cursor` e documentato ma non attiva ancora delta sync.
- La policy mantiene l'editing catalogo da POS differito.
- La semantica prezzi/quantita tra Admin Web e Win7POS resta foundation-level e va validata con dataset reale prima di produzione.

## Handoff

- Chiusura: `DONE_WITH_NOTES`.
- Prossima fase: `IDLE` / scelta del prossimo task.
- Nessun commit, push o stage automatico.
