# TASK-080 - Categories/Suppliers Pagination, Search, UI Polish

## Informazioni generali

- ID: `TASK-080`
- Titolo: `Categories/Suppliers Pagination, Search, UI Polish`
- Stato: `REVIEW_READY_FOR_USER_VISUAL_CHECK`
- Fase attuale: `REVIEW`
- Responsabile attuale: `REVIEWER`
- Data apertura: `2026-06-21`
- Origine: brief utente allegato `TASK-079F completion + TASK-080 Categories/Suppliers Pagination and UI Polish`
- Task base: `TASK-079F`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-080/README.md`

## Scopo

- Mantenere `TASK-079F` in review-ready, senza marcarlo `DONE`.
- Rendere le pagine `Categories` e `Suppliers` scalabili con paginazione server-side e default 10 righe.
- Applicare search server-side per nome categoria/fornitore prima della paginazione.
- Preservare `shop_id` e query params (`page`, `pageSize`, `q`/`query`, `state` se applicabile) tra filtri, paginazione e azioni riga.
- Mantenere UI compatta: nome, aggiornamento, stato attivo dove disponibile, conteggio prodotti solo se calcolato in modo bounded/no N+1.
- Preservare create/update/archive/restore, Products, import/export e Import Supplier Wizard.

## Non incluso

- Nessuna nuova dependency.
- Nessuna migration, tabella, colonna, RPC o policy.
- Nessun service role o secret lato client/browser.
- Nessun caricamento completo di categorie/fornitori per la lista paginata.
- Nessun commit, stage, push, deploy, production apply o Supabase apply.
- Nessuna chiusura `DONE`: Codex prepara handoff verso review.

## Criteri di accettazione

| CA | Descrizione | Tipo verifica | Stato |
|---|---|---|---|
| CA-01 | TASK-080 tracciato in Master Plan, task file ed evidence. | Docs | `PASS` |
| CA-02 | Categories usa paginazione/search server-side, default 10 righe. | Static/test/browser | `PASS` |
| CA-03 | Suppliers usa paginazione/search server-side, default 10 righe. | Static/test/browser | `PASS` |
| CA-04 | `shop_id`, `page`, `pageSize`, query e azioni riga preservano i parametri correnti. | Static/test/browser | `PASS` |
| CA-05 | Product count non introduce N+1 non bounded. | Static/test | `PASS` |
| CA-06 | Products e Import Supplier Wizard non regrediscono. | Static/browser | `PASS_WITH_NOTES` |
| CA-07 | Gate richiesti eseguiti con risultati reali o motivazioni `NOT_RUN`/`BLOCKED`. | Comandi reali | `PARTIAL_PASS_WITH_EXTERNAL_BLOCKERS` |

## Handoff REVIEW

Stato operativo finale: `REVIEW_READY_FOR_USER_VISUAL_CHECK`, non `DONE`.

Implementato:

- Categories e Suppliers usano `getShopCatalogEntityPageReadModel` con default `pageSize=10`, `page`, `pageSize`, `q/query` e `state` normalizzati server-side.
- La query Supabase applica scope catalogo, `deleted_at` state, search `name ilike`, count exact e `.range(from, to)` prima di costruire la lista.
- Le pagine `/shop/categories` e `/shop/suppliers` espongono form GET compatti, pagination top/bottom, page-size selector e link action che preservano `shop_id`, `q`, `state`, `page` e `pageSize`.
- `CatalogEntityList` mostra card compatte con nome, stato `Active`/`Archived`, linked products bounded sulla pagina corrente e azioni `Rename`/`Delete`.
- I dialog create/update/archive continuano a ricevere opzioni complete tramite `getShopCatalogOptionsReadModel`; la lista paginata non viene usata come source per le option dei form.
- Products e Import Supplier Wizard continuano a usare catalog options complete; Playwright locale apre il dialog `Supplier workbook preview`.

File principali toccati:

- `src/server/shop-admin/inventory-read-model.ts`
- `src/server/shop-admin/shop-section-data.ts`
- `src/app/shop/categories/page.tsx`
- `src/app/shop/suppliers/page.tsx`
- `src/app/shop/_components/CatalogEntityList.tsx`
- `tests/foundation/task-080-categories-suppliers-pagination.test.mjs`
- `tests/foundation/task-026-shop-admin-catalog-foundation.test.mjs`
- `tests/foundation/task-032-shop-admin-polish.test.mjs`
- `tests/foundation/task-history-sync-console.test.mjs`
- `tests/e2e/task-035-shop-admin-authenticated-smoke.spec.ts`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/EVIDENCE/TASK-080/README.md`

Evidence visuale:

- `docs/TASKS/EVIDENCE/TASK-080/browser-categories-pagination-search.png`
- `docs/TASKS/EVIDENCE/TASK-080/browser-suppliers-pagination-search.png`
- `docs/TASKS/EVIDENCE/TASK-080/browser-products-import-supplier-dialog-smoke.png`

Rischi residui:

- Serve review visuale utente sul feeling del layout compatto.
- Category/Supplier restore non e stato aggiunto: nel repository esiste restore audited solo per Products, non per Categories/Suppliers; aggiungerlo richiederebbe nuova boundary/RPC o mutation dedicata fuori scope.
- Gate globali `security:scan`, `verify` e `test:foundation` restano bloccati da guardrail storico su `src/server/shop-admin/catalog-mutations.ts`, fuori dallo scope TASK-080.

## Nota operativa 2026-06-21

TASK-080 e stato aperto, poi parcheggiato per rispettare la sequenza richiesta dal brief: completare prima il fix di TASK-079F sulla paginazione History server-side, quindi riprendere Categories/Suppliers.

TASK-080 ripreso dopo fix TASK-079F con suite History mirata 079-079F `PASS 23/23`.
