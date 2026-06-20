# TASK-075 - Admin Web performance audit e Products navigation latency fix

## Informazioni generali

- ID: `TASK-075`
- Titolo: `Admin Web performance audit e Products navigation latency fix`
- Stato: `REVIEW`
- Fase attuale: `REVIEW`
- Responsabile attuale: `CODEX`
- Data apertura: `2026-06-19`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-075/README.md`

## Contesto

L'Admin Console appare lenta durante la navigazione tra schede, soprattutto
quando l'utente clicca `Products`. La route `/shop/products` e dinamica,
non aveva loading segment dedicato, disabilitava il prefetch dalla sidebar
tramite `ShopShell` e caricava sia `getShopInventoryProductsPage` sia il read
model inventario completo per popolare opzioni toolbar/dialog.

## Scope

- Aprire e tracciare `TASK-075` nel Master Plan e nell'evidence.
- Audit repo-grounded di navigazione, rendering e data loading su Admin Console
  e Master Console, con priorita `/shop/products`.
- Aggiungere loading skeleton coerente per Admin Console e Products.
- Migliorare navigazione sidebar mantenendo solo link GET shop-scoped e senza
  prefetchare logout o azioni mutative.
- Aggiungere instrumentation dev/test dietro env `ADMIN_WEB_PERF_DEBUG=1`.
- Ridurre il primo render Products sostituendo il read model inventario completo
  con un read model leggero per opzioni catalogo.
- Conservare auth, RLS, shop scope, import/export, sync, devices e history.

## Non incluso

- Nessun commit, push o stage finale.
- Nessun deploy production.
- Nessun Supabase production/cloud apply.
- Nessuna nuova dipendenza.
- Nessun dato reale, secret, token, PIN, password o service-role key nel client.
- Nessun grande rewrite UI.
- Nessuna modifica Android/iOS/POS.
- Nessun cambio di modello `POS/Staff` come console separata.

## Criteri di accettazione

| CA | Descrizione | Stato |
|---|---|---|
| CA-01 | Task/evidence aperti e Master Plan aggiornato. | `PASS` |
| CA-02 | Audit route-by-route documentato per Master/Admin Console. | `PASS` |
| CA-03 | `/shop` e `/shop/products` hanno loading skeleton immediato, non tecnico e coerente con Admin Console. | `PASS` |
| CA-04 | Sidebar Admin Console non disabilita il prefetch per link di navigazione sicuri. | `PASS` |
| CA-05 | Products usa read model opzioni leggero e non carica `inventory_product_prices` per il primo render. | `PASS` |
| CA-06 | Permission/access resolution ridondante ridotta o motivata. | `PASS` |
| CA-07 | Instrumentation dev/test disponibile con env `ADMIN_WEB_PERF_DEBUG=1` senza loggare dati sensibili. | `PASS` |
| CA-08 | Check richiesti eseguiti o marcati `NOT_RUN`/`BLOCKED` con motivo reale. | `PASS_WITH_BLOCKED_AUTH_SMOKE` |
| CA-09 | Evidence include before/after, file toccati, rischi residui e prossimo passo. | `PASS` |

## Fonti lette

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `package.json`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-057-shop-catalog-workspace-import-intelligence.md`
- `docs/TASKS/EVIDENCE/TASK-057/README.md`
- `docs/TASKS/TASK-060-supplier-excel-android-style-preview-import.md`
- `docs/TASKS/EVIDENCE/TASK-060/README.md`
- `docs/TASKS/TASK-061-android-database-export-transfer-compatibility.md`
- `docs/TASKS/EVIDENCE/TASK-061/README.md`
- `docs/TASKS/TASK-072-cross-platform-catalog-sync-history-entry-write-path.md`
- `docs/TASKS/EVIDENCE/TASK-072/README.md`
- `docs/TASKS/TASK-073-account-identity-display.md`
- `docs/TASKS/EVIDENCE/TASK-073/README.md`
- `docs/TASKS/TASK-074-devices-ux-polish.md`
- `docs/TASKS/EVIDENCE/TASK-074/README.md`
- Guide Next locali:
  - `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`
  - `node_modules/next/dist/docs/01-app/02-guides/prefetching.md`
  - `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md`
  - `node_modules/next/dist/docs/01-app/02-guides/streaming.md`
  - `node_modules/next/dist/docs/01-app/02-guides/instant-navigation.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
  - `node_modules/next/dist/docs/01-app/02-guides/data-security.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`

## Matrice test/check prevista

| Check | Stato |
|---|---|
| `git status --short --branch --untracked-files=all` preflight | `PASS` |
| `git diff --check` preflight | `PASS` |
| `npm run security:scan` | `PASS` |
| `npm run test:foundation` | `PASS`, 396 test |
| `npm run typecheck` | `PASS` |
| `npm run lint` | `PASS` |
| `npm run build` | `PASS` |
| `npm run verify` | `PASS` |
| `npm run test:shop:local` | `BLOCKED_ENV`, vedi evidence |
| `npm run test:shop-admin-auth-smoke` | `BLOCKED_ENV`, vedi evidence |
| Browser Products navigation smoke | `PASS_WITH_NOTES`, non autenticato |
| `git diff --check` finale | `PENDING` |
| `git status --short --branch --untracked-files=all` finale | `PENDING` |

## Stato corrente

`REVIEW`. Implementazione pronta per review utente con verdict operativo
`DONE_READY`; Codex non marca `DONE`.
