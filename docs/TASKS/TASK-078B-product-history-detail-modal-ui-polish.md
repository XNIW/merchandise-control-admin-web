# TASK-078B - Product and History Detail Modal UI Polish

## Informazioni generali

- ID: `TASK-078B`
- Titolo: `Product and History Detail Modal UI Polish`
- Stato: `DONE_RECONCILED`
- Fase attuale: `DONE_RECONCILED`
- Data apertura: `2026-06-20`
- Origine: brief utente allegato `Titolo: TASK-078B - Product and History Detail Modal UI Polish Contesto: TASK-0...`
- Task base: `TASK-078`
- Evidence: `docs/TASKS/EVIDENCE/TASK-078B/README.md`

## Contesto

Follow-up visuale/UX su `TASK-078`. Il brief richiede di rendere i modal
Product Detail e History Entry Detail piu professionali e meno tecnici, senza
cambiare architettura, schema, RLS, RPC o read model di primo render.

Vincolo chiave: mantenere il guardrail di `TASK-077B` e `TASK-078`.
`/shop/products` e `/shop/history` devono restare light; detail prodotto,
storico prezzi, righe import e diagnostica devono caricarsi solo on-demand
quando l'utente apre il modal.

## Scope

- Product Detail Modal piu stretto su desktop, fullscreen/sheet su mobile,
  header sticky, status badge, summary cards e tabs owner-friendly.
- Product Edit dentro lo stesso modal con Save/Cancel in header sticky e
  Archive/Restore spostati nell'area Advanced/Danger.
- Product tabs riorganizzati: Overview a sezioni, Prices con prezzi correnti,
  Inventory/Sync con label leggibili, Advanced con diagnostics collassati.
- Product list actions: `Detail` primario, `Edit` secondario che apre lo stesso
  modal in edit mode con fallback href esistente, Archive/Restore meno
  dominante.
- History Entries list compatta: niente fallback `Open Detail` come valore dati,
  una sola summary line e un solo bottone Detail.
- History Entry Detail Modal con summary reale, row preview filtrabile,
  `Not resolved` de-enfatizzato, header row ignorata se verificabile,
  diagnostics redatti collassati.
- Nuove label client collegate a `dictionary.exact` per IT/ES/ZH senza
  tradurre valori DB o payload.

## Non incluso

- Nessuna nuova dipendenza.
- Nessun cambio schema/RLS/RPC.
- Nessun nuovo read model pieno nel primo render.
- Nessun service-role key o secret nel client.
- Nessun deploy, commit, push o stage.
- Nessuno smoke browser autenticato con dataset reale.

## Criteri di accettazione

| CA | Descrizione | Stato |
|---|---|---|
| CA-01 | Product modal mantiene fetch lazy e migliora layout/header/tabs senza allargare il first render. | `PASS` |
| CA-02 | Edit prodotto avviene nello stesso modal con Save/Cancel e server action esistenti. | `PASS` |
| CA-03 | Archive/Restore non appaiono nel flusso edit e sono separati in Advanced/Danger. | `PASS` |
| CA-04 | History list non usa `Open Detail` come valore tecnico e resta su read model light. | `PASS` |
| CA-05 | History modal mostra righe import con filtri locali e diagnostics collassati/redatti. | `PASS` |
| CA-06 | i18n nuove label passa attraverso exact dictionaries senza shadow dei corrective. | `PASS` |
| CA-07 | Check reali eseguiti o motivati `NOT_RUN`/`BLOCKED`. | `PASS` |

## Fonti lette

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-078-admin-console-product-history-detail-modals.md`
- `docs/TASKS/EVIDENCE/TASK-078/README.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
- `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
- `node_modules/next/dist/docs/01-app/02-guides/data-security.md`
- `src/app/shop/_components/ProductDetailModalController.tsx`
- `src/app/shop/_components/HistoryDetailModalController.tsx`
- `src/app/shop/products/page.tsx`
- `src/app/shop/history/page.tsx`
- `src/i18n/dictionaries.ts`
- `src/server/shop-admin/detail-modal-read-model.ts`
- `src/server/shop-admin/history-read-model.ts`

## Implementazione

- Product modal: width ridotta, mobile fullscreen, `aria-labelledby`, focus
  restore, tabs accessibili, summary stabile e Advanced/Danger separato.
- Product edit: form compatto per Identity, Classification e Pricing/stock,
  `step` numerici, Save/Cancel nell'header sticky e feedback action persistente.
- Product list: `Detail` primario; `Edit` apre il modal in edit mode con
  progressive enhancement e fallback href verso il pannello esistente.
- History list: card piu compatta con `Detail contents` e nota deferred,
  rimosso `Open Detail` dai valori.
- History modal: summary con dati disponibili, row filters locali,
  celle assenti come `-`, shortcut prodotto disabilitato con motivazione,
  diagnostics redatti collassati fuori dai tab principali.
- i18n: nuove stringhe aggiunte ai corrective exact solo quando non gia
  presenti nei dizionari base.

## Final Review / DONE Reconciliation

Verdict: `DONE_RECONCILED`.

Il polish e riconciliato con `TASK-078C`: la visual QA locale ha sostituito il
precedente limite di screenshot autenticati usando fixture sintetica autenticata,
screenshot evidence e cleanup finale. La pagina Products resta leggera:
nessun dettaglio prodotto, righe history o diagnostica e stato aggiunto al
first render. I dettagli continuano a passare dai route handler lazy/no-store
di `TASK-078`.

Correzioni finali applicate durante la riconciliazione:

- i18n completato per le nuove label History list/detail;
- History list riportata al read model light senza summary exact nel first
  render;
- copia/test di paginazione locale riallineati a `at least`;
- summary card History resa piu stabile con valori source lunghi.
- guardrail statico TASK-054 aggiornato per accettare `TASK-078C` come ultimo
  task chiuso.

Check finali: targeted TASK-078 `PASS` 5/5, targeted History sync console
`PASS` 6/6, targeted Product list readability `PASS` 6/6, targeted i18n
TASK-062/TASK-068 `PASS`, `security:scan` PASS, `test:foundation` PASS
414/414, `typecheck` PASS, `lint` PASS, `build` e `verify`
`PASS_WITH_WARNINGS` per warning noti Next `middleware` deprecato e Node
`DEP0205`, `test:shop:local` PASS 5/5, Playwright visual TASK-078C locale
`PASS`, `git diff --check` PASS.

Nessun commit, stage, push, deploy o Supabase apply eseguito.
