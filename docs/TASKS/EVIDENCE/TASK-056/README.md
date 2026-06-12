# Evidence TASK-056

Verdict corrente: `DONE_RECONCILED`.

## Scope

- Master Console shop detail editing.
- Row navigation shortcut in `/platform/shops`.
- Server-side profile update, Platform Admin authorized, audited.

## RED

- `node --test tests/foundation/task-056-master-console-shop-detail-editing.test.mjs`:
  `FAIL` atteso, 0/5 PASS e 5/5 FAIL.
- Failure attese:
  - tracking TASK-056 assente;
  - row double-click/Enter shortcut assente;
  - `Edit shop profile` assente nel detail shop;
  - route/service update profilo assenti;
  - migration RPC auditabile assente.

## GREEN / Check finali

- `node --test tests/foundation/task-056-master-console-shop-detail-editing.test.mjs`:
  PASS 5/5.
- `npm run typecheck`: PASS (`next typegen` + `tsc --noEmit`).
- `npm run lint`: PASS.
- `npm run security:scan`: PASS.
- `npm run test:foundation`: PASS 257/257 sullo stato finale `DONE_RECONCILED`.
- `npm run build`: PASS_WITH_WARNINGS.
  Warning noti: convenzione `middleware` deprecata verso `proxy`; Node
  `module.register()` deprecato.
- `npm run verify`: PASS_WITH_WARNINGS.
  Include `lint`, `typecheck`, `security:scan` e `build`; stessi warning
  noti `middleware`/`module.register()`.
- `supabase migration up --local`: PASS; applicata solo migration locale
  `20260611203000_task_056_shop_profile_update.sql`.
- `supabase migration list --local`: PASS; local e remote/local history
  allineate fino a `20260611203000`.
- `supabase db lint --local --schema public,app_private --fail-on error`:
  PASS, `No schema errors found`.
- `git diff --check`: PASS.
- `git status --short --untracked-files=all`: PASS_WITH_EXISTING_DIRTY_WORKTREE.
  Worktree gia sporca per TASK-055 e TASK-056; nessuno stage/commit/push.

## Check E2E locali finali

- `npm run test:platform:local`: PASS.
- `npm run test:platform:local-login`: PASS.
- `PLAYWRIGHT_DISABLE_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:platform:local`:
  `PASS`, 1/1. Il drift legacy TASK-045 e stato corretto durante review.
- `PLAYWRIGHT_DISABLE_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:platform:local-shop-profile`:
  `PASS`, 1/1. Copre single click inspector, copy senza navigazione, Enter e
  double click full detail, dialog edit, update auditato, shop_code immutato,
  dettaglio aggiornato e cleanup.
- `npm run test:platform:local-login` con `CONFIRM_TASK046_PLATFORM_LOCAL_LOGIN_TEST=yes`,
  password sintetica generata in shell e cleanup del seed locale:
  `PASS`, 1/1.
- `npm run test:shop-admin-auth-smoke` con Supabase locale process-only:
  `PASS`, 4/4.
- Primo tentativo letterale di `npm run test:platform:local-shop-profile` senza
  `PLAYWRIGHT_DISABLE_WEB_SERVER=1`: `FAIL_EXTERNAL_SERVER_LOCK`, perche un
  `next dev` era gia attivo su `127.0.0.1:3000`. Non e un FAIL prodotto; i
  rerun contro il server locale gia attivo sono passati.

## Review fix - Edit dialog

- RED mirato review-fix:
  `node --test tests/foundation/task-056-master-console-shop-detail-editing.test.mjs`
  FAIL 4/5; mancava `detailSectionActions` e il form era ancora inline.
- GREEN mirato review-fix:
  `node --test tests/foundation/task-056-master-console-shop-detail-editing.test.mjs`
  PASS 5/5.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm run security:scan`: PASS.
- `npm run test:foundation`: PASS 257/257.
- `npm run build`: PASS_WITH_WARNINGS.
  Warning noti invariati: `middleware` deprecato verso `proxy` e Node
  `module.register()` deprecato.
- `npm run verify`: PASS_WITH_WARNINGS.
  Include `lint`, `typecheck`, `security:scan` e `build`.
- `git diff --check`: PASS.
- `git status --short --untracked-files=all`:
  PASS_WITH_EXISTING_DIRTY_WORKTREE. Worktree gia sporca per TASK-055/TASK-056;
  nessuno stage/commit/push.
- UX aggiornata nel primo review-fix: il form inline e stato rimosso e il
  form esistente e stato riusato dentro un dialog accessibile con
  `role="dialog"` e `aria-modal="true"`. Il review-fix 2 sposta poi il
  trigger nella card `Shop profile & fiscal identity`.
- Server-side invariato: stessa route `/platform/shops/[shopId]/profile`,
  stessa validation, stesso resolver Platform Admin, stessa RPC
  `platform_update_shop_profile`, stesso audit.
- Nessuna nuova migration aggiunta.
- Browser/Playwright visual-auth: coperto dal nuovo E2E locale TASK-056 con
  fixture sintetica Platform Admin; nessun `BLOCKED_AUTH_SESSION` residuo.

## Review fix 2 - Complete read-only shop detail

- RED mirato review-fix 2:
  `node --test tests/foundation/task-056-master-console-shop-detail-editing.test.mjs`
  FAIL 4/5; il test nuovo cercava l'action nella card
  `Shop profile & fiscal identity`, che non esisteva ancora nel full detail.
- GREEN mirato review-fix 2:
  `node --test tests/foundation/task-056-master-console-shop-detail-editing.test.mjs`
  PASS 5/5.
- Full detail `/platform/shops/[shopId]` aggiornato:
  - nuova card read-only `Shop profile & fiscal identity`;
  - campi visibili: Shop name, Shop code, Shop ID, Status, Company RUT,
    Giro, Address, City, Legal representative RUT, Created, Updated;
  - valori fiscali mancanti mostrano `Not configured`;
  - Company RUT e Legal representative RUT usano lo stesso formatter display
    del dialog.
- Trigger edit:
  - bottone visibile `Edit` spostato nella card
    `Shop profile & fiscal identity`;
  - `aria-label="Edit shop profile and fiscal identity"`.
- Dialog edit invariato nel boundary:
  - mostra solo Shop name, Company RUT, Giro, Address, City,
    Legal representative RUT, reason e confirmation;
  - `shop_code` resta read-only nel detail e non e nel form editabile;
  - route POST, validazione, resolver Platform Admin e RPC auditata restano
    invariati.
- Summary shop-level:
  - nuova card `Operational summary`;
  - mostra Members total, Owners count, Managers count, Devices total,
    Revoked devices, Audit count, Latest audit, Latest sync, Sync state;
  - Staff POS count usa solo `staff_accounts_safe` quando disponibile;
  - Products count, Categories count e Suppliers count sono indicati come
    `Not available through current boundary`, senza inventare `0`.
- Nessuna nuova migration aggiunta; resta solo
  `20260611203000_task_056_shop_profile_update.sql` per TASK-056.
- Check review-fix 2:
  - `node --test tests/foundation/task-056-master-console-shop-detail-editing.test.mjs`:
    PASS 5/5.
  - `npm run test:foundation`: PASS 257/257.
  - `npm run lint`: PASS.
  - `npm run typecheck`: PASS (`next typegen` + `tsc --noEmit`).
  - `npm run security:scan`: PASS.
  - `npm run build`: PASS_WITH_WARNINGS; warning noti `middleware` ->
    `proxy` e Node `module.register()`.
  - `npm run verify`: PASS_WITH_WARNINGS; include `lint`, `typecheck`,
    `security:scan` e `build` con gli stessi warning.
  - `git diff --check`: PASS.
  - `git status --short --untracked-files=all`:
    PASS_WITH_EXISTING_DIRTY_WORKTREE. Worktree gia sporca per TASK-055/TASK-056
    e modifiche correlate non stageate; nessuno stage/commit/push.
  - Browser/Playwright visual-auth finale: `PASS` tramite
    `tests/e2e/task-056-master-console-shop-profile-local.spec.ts`.

## Note

- TASK-055 e TASK-056 sono `DONE_RECONCILED` dopo conferma esplicita utente e
  gate reali passati.
- Cleanup locale: query finale su DB locale conferma
  `active_task035_shops=0`, `active_task045_shops=0`,
  `active_task056_shops=0`, `active_task056_admins=0`;
  restano 8 shop `TASK056_%` archiviati collegati ad audit append-only.
- RPC locale: `platform_update_shop_profile` presente (`count=1`).
- Audit TASK-056: 4 eventi locali `platform.shop.profile_update.success`
  collegati a shop `TASK056_%`.
- `npm run db:local:status`: `FAIL_CLOSED` atteso per `.env.local` puntato a
  `supabase_cloud`; container Supabase locale e status redatto confermati.
- Produzione/cloud: `NOT_USED`, nessun apply remoto.
- Nessun commit, push o stage finale.

## Final review / DONE gate 2026-06-11

- Verdict: `DONE_RECONCILED`.
- Bug/harness corretti durante review:
  - `tests/e2e/task-045-platform-master-console-final-review.spec.ts` riallineato
    al provisioning unificato post-TASK-051, agli audit event
    `platform.shop.owner_bootstrap.success` e
    `platform.staff_manager.initial_recovery.success`, e al logout button.
  - Aggiunto `tests/e2e/task-056-master-console-shop-profile-local.spec.ts`.
  - Aggiunto script `test:platform:local-shop-profile` e gate locale nel runner.
  - Aggiornato `scripts/security-checks.mjs` per il nuovo evento audit
    transazionale TASK-051 usato dal test.
- Rischi residui:
  - Warning framework/toolchain non bloccanti: Next `middleware` -> `proxy`,
    Node `[DEP0205]`, Playwright `NO_COLOR`/`FORCE_COLOR`.
  - Vercel/Cloudflare production, Win7POS live, Sales Sync live restano
    parcheggiati/non promossi.
