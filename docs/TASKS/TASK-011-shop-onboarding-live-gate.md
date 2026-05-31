# TASK-011 - Shop Onboarding Live Gate

## Informazioni generali

- ID: `TASK-011`
- Titolo: Shop Onboarding Live Gate
- Stato: `DONE`
- Fase attuale: `DONE_RECONCILED`
- Execution: `PASS`
- Responsabile attuale: `CODEX / DONE_RECONCILIATION`
- Data apertura: 2026-05-30
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-011/README.md`
- Commit: `NOT_CREATED` (richiesto esplicitamente no commit)
- Push: `NOT_RUN` (richiesto esplicitamente no push)

## Scopo

Verificare end-to-end il flusso reale di onboarding shop:

1. Platform Admin crea un nuovo shop.
2. Platform Admin assegna l'account Google indicato dall'utente come `shop_owner` iniziale.
3. Lo stesso account accede alla Shop Admin Console come account personale web.
4. L'account vede solo shop autorizzati, read model shop-scoped, membership e audit.
5. Le credenziali POS/staff restano fuori scope e future.

## Esito finale

TASK-011 e stato completato con gate live positivo.

- L'account Google indicato dall'utente e presente in Supabase, profilo attivo, email confermata e visibile nel read model Platform Admin.
- Lo stesso profilo resta `platform_admin` attivo e ha ricevuto membership `shop_owner` sullo shop sintetico TASK-011.
- `/` continua a instradare i Platform Admin verso `/platform`.
- `/platform` resta accessibile solo a Platform Admin attivi.
- `/shop` ora risolve l'accesso in modo route-specific da `shop_members`, quindi un account dual-role `platform_admin` + `shop_owner` puo aprire Shop Admin.
- Lo `shop_id` in query string resta solo navigazione: il gate negativo con shop id falso non ha esposto dati non autorizzati.
- Tutti gli shop sintetici TASK-011 creati durante i tentativi risultano archiviati via soft delete; nessun hard delete e nessuna cancellazione audit.

## Letture completate

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-007-auth-routing-route-protection.md`
- `docs/TASKS/TASK-009-shop-switcher.md`
- `docs/TASKS/TASK-010-shop-read-model-real-data.md`
- `docs/TASKS/EVIDENCE/TASK-011/README.md`
- `src/server/auth/admin-routing.ts`
- `src/server/shop-admin/shop-access.ts`
- `src/server/shop-admin/read-model.ts`
- `src/app/page.tsx`
- `src/app/platform/layout.tsx`
- `src/app/shop/layout.tsx`
- `src/components/auth/AccessState.tsx`
- `src/components/shop/ShopShell.tsx`
- `tests/foundation/auth-routing.test.mjs`
- `tests/foundation/shop-switcher.test.mjs`
- `tests/foundation/shop-read-model.test.mjs`
- `tests/e2e/shop-onboarding-live-gate.spec.ts`
- `scripts/security-checks.mjs`
- Next.js locale:
  - `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
  - `node_modules/next/dist/docs/01-app/02-guides/authentication.md`
  - `node_modules/next/dist/docs/01-app/02-guides/data-security.md`
- Supabase changelog e docs SSR/Auth correnti, con focus su boundary server-side e sessione SSR.

## Scope incluso

- Fix dual-role limitato a Shop Admin route access.
- Harness TDD/foundation per bloccare regressioni sul resolver Shop Admin.
- Gate security aggiornato per vietare il riuso del resolver generale dentro `src/server/shop-admin/shop-access.ts`.
- Harness Playwright live opt-in, redatto e senza trace/video/screenshot.
- Verifica live Platform Admin Console.
- Creazione shop test via UI `/platform/operations`.
- Assegnazione owner iniziale.
- Verifica DB `shops`, `shop_members`, `audit_logs`.
- Verifica sessione browser owner e accesso `/shop`.
- Verifica read model `/shop/overview`, `/shop/members`, `/shop/audit`.
- Verifica negativa con `shop_id` falso.
- Cleanup tramite soft delete dello shop test.
- Discovery POS/staff credential model nello schema/repo.

## Non incluso

- Nessun CRUD prodotti, categorie, fornitori.
- Nessun import/export Excel.
- Nessun POS login reale.
- Nessun account staff reale.
- Nessun PIN/password staff.
- Nessuna nuova migration.
- Nessuna nuova dipendenza.
- Nessun commit.
- Nessun push.
- Nessun hard delete.
- Nessuna cancellazione audit log.
- Nessun uso di service role nel client/browser.

## Criteri di accettazione

| CA | Criterio | Stato |
| --- | --- | --- |
| CA-01 | Governance TASK-011 creata e Master Plan aggiornato | `PASS` |
| CA-02 | Pre-flight repo eseguito | `PASS` |
| CA-03 | TASK-010 gia committato/pushato o stato documentato | `PASS` |
| CA-04 | Owner verificato in `profiles` / auth prima di creare dati | `PASS` |
| CA-05 | Platform Admin Console vede il profilo owner | `PASS_WITH_NOTES` |
| CA-06 | Shop test TASK011 creato via flusso reale | `PASS` |
| CA-07 | Membership owner `shop_owner` verificata | `PASS` |
| CA-08 | Audit create/owner assign verificato | `PASS` |
| CA-09 | Browser session owner ottenuta senza stampare token/link | `PASS` |
| CA-10 | Owner accede alla Shop Admin Console | `PASS` |
| CA-11 | Shop Admin read model e pagine `/shop/*` verificate come owner | `PASS` |
| CA-12 | Negative authorization cross-shop verificata | `PASS` |
| CA-13 | Cleanup soft-delete documentato | `PASS` |
| CA-14 | POS/staff credential check documentato senza creare credenziali | `PASS_WITH_NOTES` |
| CA-15 | Evidence include check reali e motivazioni | `PASS` |

## Matrice CA -> evidence

| CA | Metodo | Evidence |
| --- | --- | --- |
| CA-01 | File/docs | `docs/MASTER-PLAN.md`, questo file, `docs/TASKS/EVIDENCE/TASK-011/README.md` |
| CA-02 | CLI git | `git status --short`, `git diff --stat`, `git diff --check` |
| CA-03 | CLI git | `git log --oneline --decorate -8`: `HEAD`, `main`, `origin/main` su `Complete shop admin read model` |
| CA-04 | Supabase linked/API redatto | Candidate count 1; profile prefix `6425adb0`; email hash `50094971cb3a`; profile active; email confirmed |
| CA-05 | Playwright + DB | `/platform/users` raggiunta; display profile visibile; nota: UI non mostra email/id completo |
| CA-06 | Playwright UI + API | ultimo gate `TASK011_TEST_MPT7XWN3ECF5`, shop prefix `5c350e09`, status iniziale active |
| CA-07 | API | 1 membership owner attiva sullo shop test |
| CA-08 | API | create/owner audit events = 2 |
| CA-09 | Playwright harness | OTP/magic link usato in memoria, cookie SSR impostati, no trace/video/screenshot |
| CA-10 | Playwright harness | `/shop` ha mostrato `Shop Overview` con account dual-role |
| CA-11 | Playwright harness | `/shop/overview`, `/shop/members`, `/shop/audit` con `Live shop data` e shop selezionato |
| CA-12 | Playwright harness | `shop_id=00000000-0000-4000-8000-000000000000` ignorato; nessun fake id visibile |
| CA-13 | UI + API | shop test archiviato, archive audit events = 1 |
| CA-14 | Repo/schema scan | Nessun modello completo `staff_accounts` / `staff_code` / PIN-password trovato |
| CA-15 | Evidence README | Matrice check con esiti reali |

## Implementazione

### Fix dual-role

- `src/server/shop-admin/shop-access.ts` non importa piu `resolveCurrentAdminRouteAccess`.
- `resolveCurrentShopAdminShellAccess` usa direttamente `supabase.auth.getUser()`.
- L'autorizzazione Shop Admin deriva da membership attive `shop_owner` / `shop_manager` in `shop_members`.
- I dettagli shop passati alla UI sono letti solo per `shop_id` gia autorizzati server-side.
- `src/app/shop/layout.tsx` mostra gli stati negati del resolver Shop Admin senza convertire un dual-role in blocco Platform Admin.
- `src/server/shop-admin/read-model.ts` continua ad accettare solo shop da `availableShops` e non usa il query param come fonte autorizzativa.
- `src/server/auth/admin-routing.ts`, `/` e `/platform` non sono stati cambiati: la priorita Platform Admin resta il default root/platform.

### TDD

- RED: `node --test tests/foundation/shop-switcher.test.mjs` fallito su `auth.getUser()` mancante e dipendenza da `resolveCurrentAdminRouteAccess`.
- GREEN: `node --test tests/foundation/shop-switcher.test.mjs` `PASS`, 4 test passati.
- Gate security aggiornato in `scripts/security-checks.mjs` per bloccare `resolveCurrentAdminRouteAccess` e `.from("platform_admins")` nel resolver Shop Admin.

### Live gate finale

- Comando opt-in:

```bash
CONFIRM_TASK011_SHOP_ONBOARDING_LIVE_TEST=yes \
TASK011_OWNER_EMAIL='[REDACTED_BY_EVIDENCE]' \
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3011 \
PLAYWRIGHT_WEB_SERVER_COMMAND='npm run dev -- --hostname 127.0.0.1 --port 3011' \
PLAYWRIGHT_REUSE_SERVER=0 \
npx playwright test tests/e2e/shop-onboarding-live-gate.spec.ts --project=chromium-desktop --reporter=list
```

- Esito finale: `PASS`, 1 test passato.
- Warning non bloccanti: Node `DEP0205`, `NO_COLOR` ignorato per `FORCE_COLOR`.
- Shop finale del gate: `TASK011_TEST_MPT7XWN3ECF5`.
- Shop id redatto: `5c350e09...`.
- Created by profile prefix: `6425adb0...`.
- Stato finale: `archived`.
- Membership owner attive: `1`.
- Audit create/owner assign: `2`.
- Audit soft delete cleanup: `1`.

## Iterazioni live

| Tentativo | Esito | Dati creati |
| --- | --- | --- |
| Magic link via callback app | `FAIL` su login page/callback non compatibile con OTP link admin | No |
| OTP SSR cookie + locator generico `Users / Profiles` | `FAIL` per strict mode locator | No |
| OTP SSR cookie + locator fix pre dual-role | `FAIL_EXPECTED_BLOCKER` su `BLOCKED_TASK011_OWNER_IS_ACTIVE_PLATFORM_ADMIN` | Si, poi archiviati |
| Resume dual-role fix, locator shop code generico | `FAIL` per strict mode locator dopo accesso Shop Admin riuscito | Si, poi archiviati |
| Locator `Live shop data` generico | `FAIL` per strict mode locator dopo accesso Shop Admin riuscito | Si, poi archiviati |
| Locator specifici finali | `PASS` | Si, poi archiviati |

## POS/staff credential check

- Nel repo/schema letto non esiste un modello completo `staff_accounts`.
- Non risultano flussi verificati per `shop_code + staff_code + PIN/password`.
- Non sono state create credenziali POS.
- Account personale owner e staff/POS restano concetti separati.
- La creazione del primo operatore POS deve restare task futuro separato.

## Check finali

| Check | Esito | Note |
| --- | --- | --- |
| `git diff --check` | `PASS` | Exit code 0, nessun whitespace error. |
| `npm run test:foundation` | `PASS` | 36 test passati / 0 falliti. |
| `npm run verify` | `PASS_WITH_WARNINGS` | lint + typecheck + security scan + build completati; warning Node `DEP0205` non bloccante. |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3012 ... npm run test:ui-smoke -- --project=chromium-desktop` | `PASS_WITH_WARNINGS` | 22 test passati / 0 falliti; warning `DEP0205` e `NO_COLOR`/`FORCE_COLOR` non bloccanti. |
| TASK-011 live gate opt-in | `PASS_WITH_WARNINGS` | 1 test passato / 0 falliti; warning runtime non bloccanti. |

## Supabase linked finali

| Check | Esito | Note |
| --- | --- | --- |
| `supabase --version` | `PASS` | CLI `2.102.0`. |
| `supabase db push --linked --dry-run` | `PASS` | Remote database up to date. |
| `supabase migration list --linked` | `PASS_AFTER_RETRY` | Primo run bloccato da temp login role/circuit-breaker; rerun passato con local/remoto allineati fino a `20260530120000`. |
| `supabase db lint --linked --schema public,app_private --level error --fail-on error` | `PASS` | No schema errors found. |
| `supabase db advisors --linked --type security --level error --fail-on error` | `PASS` | No issues found. |
| API redatta ultimi shop TASK011 | `PASS` | Tutti gli shop recenti risultano `archived`, membership owner e audit presenti. |

## File toccati

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-011-shop-onboarding-live-gate.md`
- `docs/TASKS/EVIDENCE/TASK-011/README.md`
- `docs/TASKS/EVIDENCE/LONG-GOAL/README.md`
- `scripts/security-checks.mjs`
- `src/app/shop/layout.tsx`
- `src/server/shop-admin/read-model.ts`
- `src/server/shop-admin/shop-access.ts`
- `tests/foundation/shop-switcher.test.mjs`
- `tests/e2e/shop-onboarding-live-gate.spec.ts`

## Conferme negative

- Nessun dato reale, token, password, JWT o magic link salvato o stampato.
- Nessun service role esposto al client/browser.
- Nessun hard delete.
- Nessuna cancellazione audit.
- Nessuna migration.
- Nessuna nuova dipendenza.
- Nessun account finto alternativo creato.
- Nessuna revoca del grant `platform_admin`.
- Nessun POS/staff login o credenziale creata.
- Nessun commit.
- Nessun push.

## Rischi residui

- Gli shop sintetici TASK-011 restano archiviati per audit trail.
- Esistono profili live test precedenti con membership attiva; TASK-011 non li ha modificati.
- Il modello POS/staff resta futuro e non verificato end-to-end.

## Handoff finale

- Verdict: `DONE_RECONCILED`.
- Stato finale: `DONE`.
- Criteri di accettazione: `PASS`.
- Prossima fase: nessun task attivo; decidere il prossimo task separato dopo review/commit della tranche corrente.
