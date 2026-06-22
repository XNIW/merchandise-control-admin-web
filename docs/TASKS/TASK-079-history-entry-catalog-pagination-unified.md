# TASK-079 - History Entry and Catalog Pagination Unified Completion

## Informazioni generali

- ID: `TASK-079`
- Titolo: `History Entry and Catalog Pagination Unified Completion`
- Stato: `DONE_RECONCILED`
- Fase attuale: `DONE_RECONCILED`
- Responsabile attuale: `DONE_RECONCILED`
- Data apertura originaria: `2026-06-21`
- Data riconciliazione finale: `2026-06-22`
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
- Se mapping/source e davvero bloccato, il blocco resta limitato al caso reale
  di pagina 1 senza filtri e senza righe History shop-scoped leggibili.
- Fix finale cloud: il merge direct `shop_id` + legacy owner bridge carica
  `0..to` per sorgente e taglia dopo il merge globale. Questo evita che un
  bridge legacy corto produca `PGRST103 Requested range not satisfiable` su
  `page=2` e venga mostrato come `Read blocked`.

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
- Stato finale riconciliato a `DONE_RECONCILED` dopo review orchestrata e
  check finali reali.

## Criteri di accettazione

| CA | Descrizione | Stato |
|---|---|---|
| CA-01 | Governance consolidata sotto il solo task root `TASK-079`. | `PASS` |
| CA-02 | Legacy task/evidence spostati sotto evidence TASK-079 senza cancellare contenuti utili. | `PASS` |
| CA-03 | History pagination page 2/out-of-range non mostra `Read blocked`. | `PASS` |
| CA-04 | Counted qty vuota o `0` resta neutra; `>0 && < supplier` amber; `>= supplier` verde. | `PASS` |
| CA-05 | Categories/Suppliers pagination/search server-side mantenute. | `PASS` |
| CA-06 | Products e Import Supplier Wizard non regrediscono. | `PASS_WITH_NOTES` |
| CA-07 | Check finali eseguiti o documentati con blocker reali. | `PASS` |

## Rischi residui

- Review visuale utente sugli screenshot resta follow-up facoltativo, non
  blocker repo-controllabile.
- Category/Supplier restore resta follow-up: il repository ha una boundary
  restore audited per Products, non per Categories/Suppliers.

## Handoff

Stato operativo finale: `DONE_RECONCILED`.

Root cause finale: su cloud lo shop rehearsal aveva righe dirette piu 6 righe
legacy owner bridge. La page 2 default chiedeva `range(10,19)` anche alla
sorgente legacy; PostgREST rispondeva `PGRST103 Requested range not
satisfiable`, e il read model trasformava l'errore in `Read blocked`.

Review orchestrata finale 2026-06-22: governance, History data/pagination,
UX/mobile, Catalog pagination e QA/security hanno restituito `READY_FOR_DONE`.

Correzioni finali prima della chiusura:

- Counted Qty/Sale Price draft vuoti restano vuoti, senza fallback al source.
- Categories/Suppliers preservano `state` nei form GET di filtro.
- Linked product counts per categorie/fornitori sono batch/bounded con fallback
  paginato e non N+1.
- Staff-aware catalog assignment valida lo scope per riga e aggiorna per id
  verificati, senza filtro mutativo legacy su `owner_user_id`.

Check reali finali: cloud History smoke su `3055` `PASS` 6/6 con `page=2`
`11-20 of 45` e nessun `shop_inventory_sources gate`; cloud Catalog
state/pagination `PASS`; cloud Counted Qty zero non distruttivo `PASS`;
`node scripts/i18n-hardcoded-ui-scan.mjs` `PASS`; targeted 057/079/080
`PASS` 30/30; `npm run test:foundation` `PASS` 453/453; `npm run verify`
`PASS`; `git diff --check` `PASS`. `build` passa con warning non bloccanti
Next `middleware` deprecato e Node `[DEP0205]`.

Nessun commit, stage, push, deploy, migration, Supabase apply, History Save o
import apply eseguito.
