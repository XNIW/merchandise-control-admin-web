# TASK-007 - Auth Routing and Route Protection

## Informazioni generali

- ID: `TASK-007`
- Titolo: Auth Routing and Route Protection
- Stato: `READY_FOR_REVIEW`
- Fase attuale: `EXECUTION_HANDOFF`
- Responsabile attuale: `CODEX / HANDOFF`
- Data apertura: 2026-05-30
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-007/README.md`
- Commit: `NOT_CREATED` (richiesto no commit)
- Push: `NOT_RUN` (richiesto no push)

## Scopo

Implementare routing post-login e protezione server-side per distinguere:

- `platform_admin` attivo -> `/platform`
- `shop_owner` / `shop_manager` attivo -> `/shop`
- sessione assente, runtime non configurato, platform admin revocato, viewer-only o nessuno shop valido -> stato di accesso negato/no access

## Non scope

- Nessuna Shop Admin Console completa.
- Nessun CRUD shop-scoped.
- Nessuna gestione prodotti, staff, dispositivi, ruoli avanzati o import/export.
- Nessuna nuova dipendenza.
- Nessuna auth provider UI nuova.
- Nessun uso di `user_metadata` / `raw_user_meta_data` per autorizzazione.
- Nessun service-role client/browser.

## Piano execution

1. Creare test RED per resolver server-only e route protette.
2. Implementare resolver server-only basato su `auth.getUser()`, `platform_admins` e `shop_members`.
3. Rendere `/` un entrypoint intelligente post-login.
4. Proteggere `/platform/*` server-side tramite layout.
5. Creare `/shop` minimale protetto, senza dati finti spacciati per live.
6. Aggiornare login/callback per default post-login verso `/`.
7. Aggiornare harness security/foundation/e2e ed evidence.
8. Eseguire check reali.

## Criteri di accettazione

| CA | Criterio | Stato |
| --- | --- | --- |
| CA-01 | Resolver server-only usa `platform_admins` come fonte autorevole platform | `PASS` |
| CA-02 | Resolver server-only usa `shop_members` per ruoli shop-scoped | `PASS` |
| CA-03 | Nessuna autorizzazione da metadata auth | `PASS` |
| CA-04 | `/` instrada ruoli validi verso area corretta | `PASS` |
| CA-05 | `/platform/*` bloccato server-side se non platform admin attivo | `PASS` |
| CA-06 | `/shop` bloccato server-side se nessuno shop admin valido | `PASS` |
| CA-07 | Stati no session / not configured / revoked / no shop documentati | `PASS` |
| CA-08 | Check locali eseguiti con evidence reale | `PASS` |

## Implementazione

- Creato resolver server-only `src/server/auth/admin-routing.ts`.
- Root `/` resa entrypoint server-side: ruoli validi vengono rediretti a `/platform` o `/shop`; stati non autorizzati renderizzano `AccessState`.
- `/platform/*` protetto da `src/app/platform/layout.tsx`.
- `/shop` creato come entrypoint minimale protetto per Shop Admin, senza console completa e senza dati finti.
- Login/callback allineati al default post-login `/`, con pagina login generica `Admin sign in`.
- Harness aggiornati per security scan, foundation, typecheck route typegen e smoke UI.

## File toccati principali

- `src/server/auth/admin-routing.ts`
- `src/components/auth/AccessState.tsx`
- `src/app/page.tsx`
- `src/app/platform/layout.tsx`
- `src/app/shop/page.tsx`
- `src/app/auth/login/page.tsx`
- `src/components/auth/AuthForm.tsx`
- `src/app/auth/callback/route.ts`
- `scripts/security-checks.mjs`
- `package.json`
- `tsconfig.json`
- `tests/foundation/auth-routing.test.mjs`
- `tests/foundation/supabase-foundation.test.mjs`
- `tests/foundation/supabase-schema.test.mjs`
- `tests/e2e/platform-admin.spec.ts`
- `tests/e2e/platform-admin-live-auth.spec.ts`
- `docs/TASKS/EVIDENCE/TASK-007/README.md`

## Evidence check

Vedi `docs/TASKS/EVIDENCE/TASK-007/README.md`.

Risultati principali:

- `npm run typecheck`: `PASS`
- `npm run lint`: `PASS`
- `npm run test:foundation`: `PASS`, 25 test passati
- `npm run security:scan`: `PASS`
- `npm run build`: `PASS`, include `/shop` dynamic
- `npm run verify`: `PASS`
- `npm run test:ui-smoke` via `next start` su `127.0.0.1:3004`: `PASS`, 22 test passati

## Rischi residui

- Nessun test live dedicato a un vero `shop_owner` / `shop_manager`: richiede dati utente/shop controllati o fixture Supabase sicura.
- `/shop` e solo entrypoint minimale; la shell completa Shop Admin e le pagine figlie sono scope della milestone successiva.
- Nessuna migration Supabase creata in questo task.

## Handoff atteso

Codex non marca `DONE`. A fine execution il task va a `READY_FOR_REVIEW` con evidence aggiornata, rischi residui e check reali.
