# TASK-079 - History Entry and Catalog Pagination Unified Completion

## Informazioni generali

- ID: `TASK-079`
- Titolo: `History Entry and Catalog Pagination Unified Completion`
- Stato: `REVIEW_READY_FOR_USER_VISUAL_CHECK`
- Fase attuale: `REVIEW`
- Responsabile attuale: `REVIEWER`
- Data apertura originaria: `2026-06-21`
- Data riconciliazione: `2026-06-21`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence canonica: `docs/TASKS/EVIDENCE/TASK-079/README.md`

## Scope unificato

Questo file consolida in un solo task canonico il lavoro precedentemente
tracciato come `TASK-079`, `TASK-079B`, `TASK-079C`, `TASK-079D`,
`TASK-079E`, `TASK-079F` e `TASK-080`. Gli identificativi legacy restano solo
come riferimenti storici dentro `docs/TASKS/EVIDENCE/TASK-079/legacy-*`.

## 079.1 History Entry read-only mobile parity

- Lista/detail History usano data e titolo user-facing coerenti con mobile.
- Detail preserva source quantity, purchase e sale price read-only quando
  richiesto dal contratto read-only iniziale.
- Diagnostica tecnica resta secondaria/collassata.

## 079.2 Supplier Import to canonical History Entry

- Import Supplier crea/applica payload canonico History Entry compatibile mobile.
- Preview resta side-effect free.
- L'applicazione import non modifica source field non previsti e produce
  History Entry sincronizzabile.

## 079.3 Editable generated Detail

- Detail generated consente editing solo dei generated/import values previsti.
- Source qty e purchase restano read-only.
- Salvataggio resta server-side, auditato e shop-scoped.

## 079.4 Mobile semantics: counted quantity, sale price, complete

- `quantity` supplier/source e `purchasePrice` source restano read-only.
- `realQuantity` / counted qty e `RetailPrice` / sale price sono editabili.
- `session_overlay.complete` segue la semantica mobile verificata.

## 079.5 Compact layout, no horizontal scroll, sync analysis

- Lista History compatta in stile mobile.
- Detail table senza horizontal scroll desktop normale.
- Scroll verticale interno fino all'ultima riga.
- Sync analysis condivisa e bounded.

## 079.6 Row colors, vertical scroll, product price context

- Righe complete: verde.
- Righe con counted qty positiva ma inferiore alla supplier qty: amber.
- Counted qty vuota o `0`: neutra/bianca.
- Prodotto non risolto: neutro/bianco.
- Vecchi prezzi acquisto/vendita mostrati solo quando disponibili e diversi.
- Row total calcolato quando counted qty e sale price sono numerici.

## 079.7 History Entry server-side pagination

- `/shop/history` usa `page`, `pageSize`, `q/query`, `month`, `status` e
  `shop_id`.
- Search/status/month sono applicati server-side prima di `.range(...)`.
- Pagina 2 e pagine out-of-range non diventano `Read blocked`: mostrano righe
  o empty state coerente.
- Se mapping/source e davvero bloccato, il blocco riguarda anche pagina 1.

## 079.8 Categories server-side pagination/search/UI polish

- `/shop/categories` usa default 10 righe, `page`, `pageSize`, `q/query`,
  `state` e `shop_id`.
- Search nome categoria e state sono applicati server-side prima di `.range(...)`.
- UI card compatta con stato e linked products bounded sulla pagina corrente.

## 079.9 Suppliers server-side pagination/search/UI polish

- `/shop/suppliers` usa default 10 righe, `page`, `pageSize`, `q/query`,
  `state` e `shop_id`.
- Search nome fornitore e state sono applicati server-side prima di `.range(...)`.
- Products e Import Supplier Wizard continuano a usare catalog options complete
  separate dalla lista paginata.

## 079.10 Final QA and review

- Check mirati History e Catalog pagination aggiornati al tracking canonico.
- Browser/Playwright locale salva evidence sotto
  `docs/TASKS/EVIDENCE/TASK-079/browser/`.
- Nessun commit, stage, push, deploy, migration, production apply o Supabase
  apply eseguito.
- Stato finale preparato per review utente, non `DONE`.

## Criteri di accettazione

| CA | Descrizione | Stato |
|---|---|---|
| CA-01 | Governance consolidata sotto il solo task root `TASK-079`. | `PASS` |
| CA-02 | Legacy task/evidence spostati sotto evidence TASK-079 senza cancellare contenuti utili. | `PASS` |
| CA-03 | History pagination page 2/out-of-range non mostra `Read blocked`. | `PASS` |
| CA-04 | Counted qty vuota o `0` resta neutra; `>0 && < supplier` amber; `>= supplier` verde. | `PASS` |
| CA-05 | Categories/Suppliers pagination/search server-side mantenute. | `PASS` |
| CA-06 | Products e Import Supplier Wizard non regrediscono. | `PASS_WITH_NOTES` |
| CA-07 | Check finali eseguiti o documentati con blocker reali. | `PARTIAL_PASS_WITH_EXTERNAL_BLOCKERS` |

## Rischi residui

- Serve review visuale utente sugli screenshot finali.
- `security:scan`, `verify` e `test:foundation` restano bloccati dal guardrail
  storico su `src/server/shop-admin/catalog-mutations.ts`.
- Category/Supplier restore resta follow-up: il repository ha una boundary
  restore audited per Products, non per Categories/Suppliers.

## Handoff

Stato operativo finale: `REVIEW_READY_FOR_USER_VISUAL_CHECK`, non `DONE`.

Check reali finali: mirati TASK-079/Catalog `PASS` 32/32; mirati con TASK-028
`PASS` 38/38; `lint` `PASS`; `typecheck` `PASS`; `build`
`PASS_WITH_WARNINGS`; smoke mobile `PASS`; Playwright Catalog `PASS` 1/1;
Playwright History `PASS` 1/1; `git diff --check` `PASS`; `security:scan`,
`verify` e `test:foundation` `FAIL_EXTERNAL` per blocker storico
`src/server/shop-admin/catalog-mutations.ts`.
