# Evidence TASK-037 - Shop Admin dual access model

## Stato task

- Task: `TASK-037`
- Stato task: `DONE`
- Fase: `DONE`
- Verdict corrente: `DONE`
- Data: `2026-06-03`
- Branch: `main`
- Migration create/apply: `NOT_CREATED`
- Commit: `COMMITTED_BY_USER_REQUEST`
- Push: `PUSHED_BY_USER_REQUEST`

## Repo status iniziale

- Comando: `git status --short --branch`
- Esito: `PASS`
- Sintesi: `## main...origin/main`

## Decisione prodotto registrata

- `personal_account`: account personale web, multi-shop, autorizzato da `shop_members`.
- `pos_staff_manager`: futuro staff POS manager/admin, single-shop, autorizzato da credenziale staff e permesso full-web.
- `profiles` e `staff_accounts` restano separati.
- `cashier/operator` e staff ordinario non accedono alla Shop Admin web.

## Stato attuale account personale

- `/auth/login`: Supabase browser auth email/password personale.
- `/shop`: server-side guard con `resolveCurrentShopAdminShellAccess`.
- Autorizzazione: `shop_members.profile_id = auth.users.id`, `membership_status = active`, `role_key in ('shop_owner', 'shop_manager')`.
- Shop switcher: `shop_id` query param solo navigazione, non autorizzazione.
- Stato: `IMPLEMENTED`.

## Stato attuale staff/POS credential model

- `staff_accounts`: presente, separata da `profiles`.
- `staff_accounts_safe`: presente, safe view senza `credential_hash`.
- `credential_status`: presente.
- `pos_sessions`: presente.
- `pos_device_credentials`: presente.
- `shop_devices`: presente.
- `audit_logs`: presente, POS staff actor rappresentato con `actor_profile_id = null`.
- `role_key manager`: `PRESENT`.
- `admin` role_key: `NOT_PRESENT_IN_SCHEMA`.
- Current schema staff web role: `manager` only.
- Staff manager web login completo: `PLANNED_NOT_IMPLEMENTED`.

## Implementation evidence

- `src/server/shop-admin/access-principal.ts` e server-only.
- `ShopAdminPersonalAccountPrincipal` formalizza l'accesso personale esistente.
- `ShopAdminPosStaffManagerPrincipal` formalizza il target futuro staff manager.
- `resolveCurrentShopAdminPrincipal` avvolge il guard personale esistente.
- `resolvePosStaffManagerWebPrincipal` non autentica staff web e richiede input gia verificato con ruolo schema corrente `manager`.
- `POS_STAFF_WEB_REQUIRED_PERMISSION = shop_admin.full_access`.
- `POS_STAFF_WEB_FUTURE_ADMIN_ROLE_KEY = admin` resta target documentato e non abilita accesso attuale.
- Nessuna route staff web login aggiunta.
- Nessuna migration TASK-037 creata.

## Review finale hardening

- Finding corretto: la prima foundation accettava `manager/admin` come set di ruolo pur documentando `admin` come `NOT_PRESENT_IN_SCHEMA`.
- Fix: `isPosStaffEligibleForShopAdminWeb` accetta solo `POS_STAFF_WEB_CURRENT_SCHEMA_ROLE_KEY = manager`.
- Fix: `POS_STAFF_WEB_FUTURE_ADMIN_ROLE_KEY = admin` resta costante target/follow-up e non abilita accesso runtime.
- Fix: rimossi helper non integrati per selezione shop/ruolo staff web, per evitare assunzioni autorizzative premature.
- Guardrail: foundation test e `security:scan` falliscono se torna il pattern permissivo `manager/admin` o helper autorizzativi non usati.
- Security diff scan locale: `/tmp/codex-security-scans/merchandise-control-admin-web/ea1f0b8_20260604_task037_final/report.md` e `report.html`, no findings reportable dopo fix.

## Chiusura DONE

- Conferma esplicita utente ricevuta per marcare TASK-037 `DONE`, fare commit e push su `main`.
- Login staff web completo resta non implementato e deve essere task separato.
- Nessuna migration TASK-037 creata/applicata.
- Nessun Sales Sync, nessun Win7POS/Android/iOS change, nessun secret, nessun Vercel Production.
- Check finali di chiusura rieseguiti prima di stage/commit/push; la foundation iniziale ha evidenziato solo un gate legacy TASK-035 da aggiornare per `Ultimo task completato: TASK-037`, poi e passata.

## Audit/security boundary

- Nessun `credential_hash`, PIN, password, token o secret nel client/browser.
- Nessun service-role lato client/browser.
- Staff web futuro deve usare cookie HTTP-only, audit login/logout, rate limit/lockout e deny generici.
- PIN breve per web admin resta rischio documentato; non usato da TASK-037.
- No Sales Sync.
- No Google/Apple/WeChat.
- No email invite.
- No Win7POS/Android/iOS changes.

## Check

| Check | Esito | Note |
| --- | --- | --- |
| `node --test tests/foundation/task-037-dual-access-model.test.mjs` RED review | `PASS_EXPECTED_FAIL` | 2 failure attese su ruolo corrente staff web e docs current-schema. |
| `node --test tests/foundation/task-037-dual-access-model.test.mjs` GREEN review | `PASS` | 4/4 pass dopo hardening. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run test:foundation` finalizzazione, primo run | `FAIL_THEN_FIXED` | 166/167 pass; fallito solo gate legacy TASK-035 su `Ultimo task completato` che non includeva ancora TASK-037. |
| `npm run test:foundation` finalizzazione, secondo run | `PASS` | 167/167 pass dopo aggiornamento compatibilita TASK-035. |
| `npm run typecheck` | `PASS` | `next typegen` + `tsc --noEmit` pass. |
| `npm run lint` | `PASS` | `eslint` exit 0. |
| `npm run build` | `PASS_WITH_WARNING` | Build exit 0; warning noto `[DEP0205]`. |
| `npm run verify` | `PASS_WITH_WARNING` | lint/typecheck/security/build pass; warning noto `[DEP0205]`. |
| `npm run test:shop-admin-auth-smoke` | `PASS_WITH_SKIP` | 1 passed, 1 skipped; ramo autenticato saltato per ambiente corrente non locale/sicuro. |
| `npm run dev:db:check` | `PASS_FAIL_CLOSED` | Exit 2 atteso: `.env.local` punta a `supabase_cloud` e container locale mismatch; nessun uso production. |
| `git diff --check` | `PASS` | Exit 0, nessun whitespace error. |
| `git status --short --branch --untracked-files=all` pre-stage | `PASS_WITH_TASK037_CHANGES` | `## main...origin/main`; modifiche TASK-037 e compat gate TASK-035 pronte per stage selettivo. |
| `git diff --cached --name-status` pre-stage | `PASS_NO_STAGE` | Nessun file staged prima dello stage selettivo finale. |

## Rischi residui

- `admin` staff role non esiste ancora nello schema.
- Non esiste storage verificato per permessi staff web granulari tipo `shop_admin.full_access`.
- Login staff web completo richiede task separato per cookie HTTP-only, rate limit/lockout, audit login/logout e UX.
- POS API esistenti non sono sessione web staff.

## Verdict

`DONE`
