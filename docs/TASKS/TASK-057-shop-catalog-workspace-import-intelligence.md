# TASK-057 - Shop Catalog Workspace: prodotti, categorie, fornitori e import Excel intelligente

## Informazioni generali

- ID: `TASK-057`
- Titolo: `Shop Catalog Workspace: prodotti, categorie, fornitori e import Excel intelligente`
- Stato: `REVIEW`
- Fase attuale: `REVIEW`
- Responsabile attuale: `CODEX_REVIEW_FIX`
- Verdict tecnico: `READY_FOR_DONE_CONFIRMATION`
- Data apertura: `2026-06-11`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-057/README.md`
- Nota governance: Codex prepara handoff verso `REVIEW`; il task non viene marcato
  `DONE` senza conferma esplicita dell'utente.

## Contesto

La Shop Admin Console espone gia route separate per prodotti, categorie,
fornitori e import/export. Dal punto di vista prodotto, la pagina principale
deve diventare `/shop/products`: un workspace catalogo operativo per leggere,
filtrare, modificare e importare prodotti reali con boundary server-side.

Le route `/shop/categories` e `/shop/suppliers` restano navigabili. La route
`/shop/import-export` resta solo come compatibilita/deep link temporaneo e non
deve duplicare la logica del nuovo workspace.

## Scope

- Aprire e tracciare TASK-057 in Master Plan ed evidence.
- Riorganizzare `/shop/products` come Catalog Workspace desktop.
- Rendere create/update/archive/restore azioni toolbar con dialog accessibili,
  non form grandi sempre aperti.
- Applicare lo stesso pattern lista + toolbar + dialog a categorie e fornitori.
- Integrare import/export Excel dentro Products.
- Rafforzare il parser Excel server-side per file fornitore e workbook database
  completo, usando dipendenze esistenti.
- Verificare boundary di scrittura catalogo: mapping `shop_inventory_sources`,
  permessi, action context, mutator, audit e divieto service-role lato client.
- Aggiungere test foundation TASK-057 e rieseguire check reali.

## Esclusioni

- Nessun commit.
- Nessun push.
- Nessuno stage finale.
- Nessun deploy production/cloud apply.
- Nessuna nuova dipendenza senza blocker reale documentato.
- Nessun dato reale, token, password o credential hardcoded.
- Nessun service-role o secret lato client/browser.
- Nessuna nuova console POS separata.
- Nessun refactor non richiesto fuori dallo scope catalogo.
- Nessun bypass di mapping, permessi, RLS/RPC o audit.

## Criteri di accettazione

| CA | Descrizione | Stato |
|---|---|---|
| CA-01 | TASK-057 aperto con evidence dedicata e Master Plan aggiornato come task attivo. | `PASS` |
| CA-02 | Discovery reale completata su schema/RPC/action context/mapping e fonti mobile Excel, con risultato in evidence. | `PASS` |
| CA-03 | `/shop/products` mostra Catalog Workspace con search, filtri Category/Supplier per nome, filtro state e tabella prodotti completa. | `PASS` |
| CA-04 | Products non mostra dati finti e mantiene empty/blocked state operativo quando il mapping non e ready. | `PASS` |
| CA-05 | Create/update/archive/restore Product sono toolbar buttons con dialog accessibili e mutazioni server-side esistenti/sicure. | `PASS` |
| CA-06 | Categories e Suppliers usano lista + toolbar + dialog senza grandi form sempre aperti. | `PASS` |
| CA-07 | Import/Export e integrato in Products; `/shop/import-export` resta compat/deep link senza duplicare logica. | `PASS` |
| CA-08 | Import fornitore Excel rileva foglio/header/alias multilingua, ignora metadata, preview-first e protegge formula injection. | `PASS` |
| CA-09 | Full database import/export resta avanzato, preview-first e con conferma forte. | `PASS` |
| CA-10 | Boundary scrittura catalogo verificato: shop-scoped, server-side, auditato, senza service-role client/browser. | `PASS` |
| CA-11 | Test foundation TASK-057 in RED/GREEN e check finali documentati con output reale o `NOT_RUN` motivato. | `PASS` |
| CA-12 | Review finale repo-grounded completa, bug repo-controllabili corretti, cleanup TASK057 e handoff pronto per conferma utente. | `PASS_READY_FOR_DONE_CONFIRMATION` |

## Fonti obbligatorie lette

- `docs/MASTER-PLAN.md`
- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `package.json`
- Guide Next locali in `node_modules/next/dist/docs/` per Server/Client
  Components, mutating data, `page.tsx` e Route Handlers.
- Codice Shop Admin e import/export elencato nel brief utente.

## Matrice test/check prevista

| Check | Stato |
|---|---|
| `node --test tests/foundation/task-057-shop-catalog-workspace-import-intelligence.test.mjs` | `PASS 21/21` |
| `node --test tests/foundation/task-028-catalog-crud-import-export-win7pos-e2e.test.mjs tests/foundation/task-057-shop-catalog-workspace-import-intelligence.test.mjs` | `PASS 27/27` |
| `npm run test:foundation` | `PASS 278/278` |
| `npm run lint` | `PASS` |
| `npm run typecheck` | `PASS` |
| `npm run security:scan` | `PASS` |
| `npm run build` | `PASS_WITH_WARNINGS` |
| `npm run verify` | `PASS_WITH_WARNINGS` |
| `npm run test:shop-admin-auth-smoke` | `PASS 4/4`, wrapper local-only |
| `npm run test:platform:local` | `PASS 1/1` |
| `npm run test:platform:local-login` | `PASS_WITH_SKIP`, `1 skipped`, gated da `CONFIRM_TASK046_PLATFORM_LOCAL_LOGIN_TEST=yes` e password runtime |
| `npm run db:local:status` | `FAIL_CLOSED_EXPECTED`, `.env.local` punta `supabase_cloud`, status Supabase redatto |
| `supabase migration up --local` | `PASS` |
| `supabase migration list --local` | `PASS` |
| `supabase db lint --local` | `PASS` |
| `git diff --check` | `PASS` |
| `git status --short --untracked-files=all` | `PASS_WITH_UNCOMMITTED_CHANGES` |

## Execution log

- `2026-06-11`: TASK-057 aperto da brief allegato. Stato iniziale:
  `EXECUTION`; nessun commit/push/stage autorizzato.
- `2026-06-12`: implementation e fix completati con QA reale locale su Dingli
  e database workbook completo, incluso import/export `PriceHistory`.
  Handoff preparato a `REVIEW`; nessun commit/push/stage.
- `2026-06-12`: review/fix finale repo-grounded. Corretti guard POST import,
  detail prodotti archiviati, copy/no-store export e export PriceHistory
  completo paginato. QA locale autenticata, Supabase local, corpus Excel,
  cleanup TASK057 e check finali passano. Verdict tecnico:
  `READY_FOR_DONE_CONFIRMATION`; il task resta `REVIEW`, non `DONE`.
- `2026-06-12`: gate runtime Shop Admin stabilizzato senza modificare prodotto:
  `npm run test:shop-admin-auth-smoke` usa ora il wrapper locale
  `run-playwright-target.mjs local`, Supabase locale process-only e web server
  Playwright locale. Run ufficiale PASS `4/4`.
