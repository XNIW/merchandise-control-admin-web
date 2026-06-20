# TASK-078B - Product and History Detail Modal UI Polish

## Informazioni generali

- ID: `TASK-078B`
- Titolo: `Product and History Detail Modal UI Polish`
- Stato: `REVIEW`
- Fase attuale: `REVIEW`
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
| CA-07 | Check reali eseguiti o motivati `NOT_RUN`/`BLOCKED`. | `PASS_WITH_NOTES` |

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

## Handoff REVIEW

Verdict: `REVIEW`.

Il polish e pronto per review funzionale/visiva. La pagina Products resta
leggera: nessun dettaglio prodotto, righe history o diagnostica e stato
aggiunto al first render. I dettagli continuano a passare dai route handler
lazy/no-store di `TASK-078`.

Check finali: targeted TASK-078 `PASS` 5/5, targeted i18n TASK-062/TASK-068
`PASS`, `typecheck` PASS, `lint` PASS, `security:scan` PASS,
`test:foundation` PASS 414/414, `build` e `verify` PASS_WITH_WARNINGS per
warning noti Next `middleware` deprecato e Node `DEP0205`,
`git diff --check` PASS, probe HTTP locale `/shop/products` PASS su dev server
esistente `127.0.0.1:3055`.

Visual browser screenshot dei modali: `NOT_RUN_AUTH_REQUIRED`, perche serve
una sessione autenticata con dataset reale per aprire Product/History detail.

## Prossima fase

`REVIEW`: validare UX su Products e History con sessione autenticata e dati
lunghi/reali. Il task non e marcato `DONE`; richiede conferma esplicita
dell'utente.
