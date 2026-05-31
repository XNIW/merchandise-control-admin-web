# TASK-009 - Shop Switcher

## Informazioni generali

- ID: `TASK-009`
- Titolo: Shop Switcher
- Stato: `DONE`
- Fase attuale: `DONE_RECONCILED`
- Responsabile attuale: `CODEX / DONE_RECONCILIATION`
- Data apertura: 2026-05-30
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-009/README.md`
- Commit: `NOT_CREATED` (richiesto no commit)
- Push: `NOT_RUN` (richiesto no push)

## Review finale / DONE reconciliation - 2026-05-30

- Verdict finale: `DONE_RECONCILED`.
- Fix applicato durante la review finale: `src/components/shop/ShopShell.tsx` ora preserva `shop_id` nei link di sezione Shop Admin tramite `buildShopHref`, cosi la selezione corrente resta stabile durante la navigazione. Aggiunti test/gate in `tests/foundation/shop-switcher.test.mjs` e `scripts/security-checks.mjs`.
- TDD fix:
  - RED: `node --test tests/foundation/shop-switcher.test.mjs` fallito sul nuovo caso `ShopShell preserves selected shop while navigating sections`.
  - GREEN: `node --test tests/foundation/shop-switcher.test.mjs` `PASS`, 4 test passati.
- Check freschi:
  - `npm run typecheck`: `PASS`.
  - `npm run lint`: `PASS`.
  - `npm run test:foundation`: `PASS`, 32 test passati.
  - `npm run security:scan`: `PASS`.
  - `npm run build`: `PASS_WITH_WARNINGS`, solo warning Node `DEP0205` gia noto.
  - `npm run test:ui-smoke` con `next start` production su `127.0.0.1:3106`: `PASS_WITH_WARNINGS`, 44 test passati.
  - `git diff --check`: `PASS`.
- Supabase linked: migration list/dry-run/lint/advisors security `PASS`; nessuna persistenza cookie/database introdotta.
- Acceptance criteria finali: `PASS`; nessun blocker critico aperto.
- Rischi residui accettati: switcher autorizzato non verificato con utente reale multi-shop; nessun read model business shop-scoped ancora renderizzato.
- Non fatto: nessuna persistenza server-side della selezione, nessun CRUD, nessun commit, nessun push, nessun TASK-010 aperto.

## Scopo

Permettere a un account personale con membership attive `shop_owner` / `shop_manager` su piu shop di scegliere il negozio corrente dalla Shop Admin Console.

## Non scope

- Nessun read model business shop-scoped completo.
- Nessun CRUD.
- Nessuna persistenza database della selezione.
- Nessun cookie custom finche non serve un piano dedicato.
- Nessuna migration Supabase.
- Nessuna nuova dipendenza.
- Nessun uso di query param come autorizzazione senza verifica membership server-side.

## Piano execution

1. Creare resolver server-only per Shop Admin shell access.
2. Leggere solo shop dove il profilo corrente ha membership attiva `shop_owner` / `shop_manager`.
3. Passare alla shell solo la lista shop autorizzati.
4. Aggiungere switcher client con `shop_id` in query string, senza fidarsi del client per autorizzazione.
5. Aggiornare harness security/foundation/e2e.
6. Eseguire check reali e aggiornare evidence.

## Criteri di accettazione

| CA | Criterio | Stato |
| --- | --- | --- |
| CA-01 | Resolver server-only legge membership attive da `shop_members` | `PASS` |
| CA-02 | Resolver legge dettagli solo per shop autorizzati | `PASS` |
| CA-03 | Switcher riceve solo shop autorizzati dal server | `PASS` |
| CA-04 | Query param `shop_id` non e fonte di autorizzazione | `PASS` |
| CA-05 | Nessun import server/Supabase nel client switcher | `PASS` |
| CA-06 | Check locali eseguiti con evidence reale | `PASS` |

## Implementazione

- Creato resolver server-only `src/server/shop-admin/shop-access.ts`.
- Il resolver riusa `resolveCurrentAdminRouteAccess`, poi legge membership attive `shop_owner` / `shop_manager` da `shop_members`.
- I dettagli shop sono letti solo per `shop_id` gia autorizzati.
- `src/app/shop/layout.tsx` passa a `ShopShell` solo `availableShops` verificati server-side e `selectedShopId`.
- `ShopShell` aggiunge select accessibile `Switch shop`; la query string `shop_id` guida solo la navigazione UI, viene preservata nei link di sezione e viene ignorata se non corrisponde a uno shop autorizzato passato dal server.
- Security scan aggiornato con `src/server/shop-admin` e gate TASK-009.

## Evidence check

Vedi `docs/TASKS/EVIDENCE/TASK-009/README.md`.

Risultati principali:

- `node --test tests/foundation/shop-switcher.test.mjs`: `PASS`, 4 test passati dopo fix reconciliation.
- `npm run typecheck`: `PASS`
- `npm run lint`: `PASS`
- `npm run test:foundation`: `PASS`, 31 test passati
- `npm run security:scan`: `PASS`
- `npm run build`: `PASS`
- `npm run verify`: `PASS`
- `npm run test:ui-smoke` via `next start` su `127.0.0.1:3004`: `PASS`, 44 test passati

## Rischi residui

- Switcher autorizzato non verificato con sessione reale multi-shop `shop_owner` / `shop_manager`.
- Nessuna persistenza server-side della selezione; `shop_id` in query string e solo stato UI.
- Nessun read model business shop-scoped ancora renderizzato.

## Handoff finale

TASK-009 e chiuso a `DONE` nella reconciliation finale autorizzata dall'utente. Prossimo passo consigliato: aprire `TASK-010 - Shop Read Model Real Data` come task separato.
