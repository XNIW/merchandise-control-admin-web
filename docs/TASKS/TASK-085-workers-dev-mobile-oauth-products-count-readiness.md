# TASK-085 - Fix workers.dev mobile OAuth and product totals readiness

## Informazioni generali

- ID: `TASK-085`
- Titolo: Fix workers.dev mobile OAuth and product totals readiness
- Stato: `REVIEW_READY`
- Fase attuale: `REVIEW`
- Responsabile attuale: `REVIEWER`
- Data apertura: `2026-06-25`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-085/README.md`
- Task precedente collegato: `TASK-084`

## Scope

Chiudere i blocker finali emersi su workers.dev mobile dopo TASK-084:

- Google OAuth mobile non deve piu esporre Cloudflare Worker Error 1102 quando si clicca `Continue with Google`.
- `/shop/products` mobile deve mostrare un totale esatto e visibile, rispettando i filtri correnti, senza `Total unavailable` o `Server-side count unavailable`.
- Lo staging workers.dev deve essere rideployato e verificato con smoke mobili reali.
- Il contratto POS/Win7POS pubblico deve restare compatibile e verificato con check non fisici.
- Aggiornare handoff/evidence senza secret, token, PIN, password o service-role.

## Non incluso

- Nessun deploy production.
- Nessun Supabase production apply.
- Nessun completamento Google interattivo con credenziali o 2FA utente.
- Nessun test fisico/VM Windows 7.
- Nessuna modifica Win7POS runtime in questo task.
- Nessuna chiusura a `DONE` da parte di Codex.

## Root cause

### Google OAuth mobile 1102

Il path OAuth conteneva una probe server-side dell'URL Supabase/Google prima del redirect browser. Su Cloudflare Workers/OpenNext questo aggiungeva fetch, parsing e timeout nel click path mobile, rendendo il runtime piu fragile al limite CPU/resource e coerente con gli eventi 1102 osservati.

Fix: la route `/auth/oauth/google` e la server action legacy Google non fanno piu probe server-side. Dopo `signInWithOAuth` validano solo la URL generata e rispondono subito con `NextResponse.redirect(..., { Cache-Control: no-store })`.

### Products exact total

La pagina `/shop/products` chiamava il read model con `includeExactTotals: false`. Questo disattivava il count esatto e forzava UI `Total unavailable` / `Server-side count unavailable`.

Fix: introdotta modalita `includeExactTotals: "count-only"` per eseguire un `count: "exact", head: true` sui prodotti con gli stessi scope e filtri della pagina, senza riattivare il summary catalogo pesante. La UI usa `pagination.totalCount` exact per la metrica `Total products`.

## Criteri di accettazione

| CA | Descrizione | Stato |
|---|---|---|
| CA-01 | Admin Web e Win7POS riallineati a `origin/main` prima delle modifiche. | `PASS` |
| CA-02 | OAuth Google route/action senza probe server-side verso provider. | `PASS` |
| CA-03 | Mobile OAuth workers.dev arriva a Google Accounts senza 1102 su tentativi ripetuti. | `PASS` |
| CA-04 | Products page usa count-only exact total e non mostra copy unavailable. | `PASS` |
| CA-05 | Products mobile autenticato mostra range exact visibile e cleanup sessioni completato. | `PASS` |
| CA-06 | POS API workers.dev valido: first-login, heartbeat, catalog pull, nessun echo credential. | `PASS` |
| CA-07 | Staging workers.dev deployato con `wrangler deploy --env staging --keep-vars --minify`. | `PASS` |
| CA-08 | Admin Web gate locali/cloud: typecheck, lint, build, verify, security, foundation, cf build, smoke. | `PASS_WITH_WARNINGS` |
| CA-09 | Win7POS non fisico: scanner online/startup/linking e build Release x86. | `PASS` |
| CA-10 | Handoff/evidence aggiornati, task resta `REVIEW_READY`, non `DONE`. | `PASS` |

## File toccati

- `src/app/auth/oauth/google/route.ts`
- `src/app/auth/login/actions.ts`
- `src/server/shop-admin/inventory-read-model.ts`
- `src/app/shop/products/page.tsx`
- `scripts/testing/task-085-workers-dev-runtime-smoke.mjs`
- `package.json`
- `tests/foundation/shop-read-model.test.mjs`
- `tests/foundation/task-065-google-oauth-redirect.test.mjs`
- `tests/foundation/task-068e-ui-rehearsal-database-parity.test.mjs`
- `tests/foundation/task-078-product-history-detail-modals.test.mjs`
- `tests/foundation/task-079b-supplier-import-canonical-history.test.mjs`
- `tests/foundation/task-079-catalog-pagination-unified.test.mjs`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-085-workers-dev-mobile-oauth-products-count-readiness.md`
- `docs/TASKS/EVIDENCE/TASK-085/README.md`
- `docs/TASKS/TASK-084-admin-web-workers-dev-staging-auth-logout-win7pos-public-connection.md`
- `docs/TASKS/EVIDENCE/TASK-084/README.md`

## Evidence sintetica

- Cloudflare staging deploy: Version ID `81195e59-fdda-430c-8c33-911ee444d367`, 100%.
- OAuth mobile workers.dev smoke: 5/5 pass, finale redatto su `accounts.google.com`.
- Products mobile authenticated smoke: exact total visible, unavailable copy absent.
- POS API workers.dev valid smoke: first-login 200, heartbeat 200, catalog pull 200, credential echo false.
- Win7POS scanners/build: PASS; build Release x86 `Avvisi: 0`, `Errori: 0`.

## Rischi residui

- Completamento Google reale puo richiedere sessione utente/2FA: non eseguito e non necessario per questo smoke.
- Windows 7 fisico/VM, catalog pull fisico e sales sync fisico restano `NOT_RUN_PHYSICAL_RUNTIME_REQUIRED`.
- Staging workers.dev non e production; custom domain/production resta fuori scope.
- CSP `form-action https://*.supabase.co` resta rischio hardening futuro, gia preesistente e non bloccante per TASK-085.

## Prossima fase

`REVIEW`: validare handoff, evidence e CI. Il task puo passare a `DONE` solo dopo conferma esplicita dell'utente.
