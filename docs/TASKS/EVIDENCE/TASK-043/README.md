# Evidence TASK-043 - Platform Admin runtime fixes

## Stato

- Task: `TASK-043 - Platform Admin runtime fixes: RLS read model, provisioning, logout and navigation latency`
- Stato task: `DONE_RECONCILED`
- Fase: `DONE_RECONCILED`
- Data: `2026-06-05`
- Branch Admin Web: `codex/task-042-review-ci-win7pos-bridge`
- Commit: `NOT_RUN_USER_REQUESTED_NO_COMMIT`
- Push: `NOT_RUN_USER_REQUESTED_NO_PUSH`
- Stage: `NOT_STAGED`
- No commit eseguito.
- No push eseguito.
- No stage finale.

## Letture e discovery

- Letti `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/MASTER-PLAN.md`, task attivo precedente `TASK-042` ed evidence collegata.
- Letta la guida locale Next in `node_modules/next/dist/docs/` per `Link`, route handlers e navigazione App Router prima di cambiare codice framework.
- Comandi discovery eseguiti:
  - `rg -n "platform_admin|platform admins|Platform Admin|Read blocked|Provisioning unavailable|server session|RLS|logout|signOut|sign out|supabase.auth" src tests docs supabase`
  - `find src -path '*platform*' -type f | sort`
  - `find src -path '*auth*' -type f | sort`
  - `find supabase -type f | sort`

## Root cause evidence

Con sessione locale sintetica `platform_admin`, creata e rimossa via Supabase locale process-only:

| Read target | Esito |
| --- | --- |
| `profiles` | `PASS` |
| `shops` | `PASS` |
| `shop_members` | `PASS` |
| `platform_admins` | `PASS` |
| `shop_inventory_sources` | `PASS` |
| `audit_logs` | `PASS` |
| `shop_devices` | `PASS` |
| `sync_events` | `PASS` |
| `staff_accounts_safe` | `BLOCKED`, code `42501`, message `permission denied for table staff_accounts` |

Conclusione: il problema non era la role check Platform Admin o il read model core; il problema era che `staff_accounts_safe` veniva incluso nel primo errore fatale e quindi bloccava tutte le pagine Platform.

## UI repro baseline

Con Next dev locale e sessione `platform_admin` sintetica:

| Route | Esito baseline |
| --- | --- |
| `/platform` | HTTP 200, ma UI mostrava `Read blocked` |
| `/platform/users` | HTTP 200, ma UI mostrava `Read blocked` |
| `/platform/shops` | HTTP 200, ma UI mostrava `Read blocked` |
| `/platform/provisioning` | HTTP 200, ma UI mostrava `Provisioning unavailable` |
| `/platform/audit` | HTTP 200, ma UI mostrava `Read blocked` |
| `/platform/system` | HTTP 200, ma UI mostrava `Read blocked` |

Console browser: nessun errore client rilevante.

## Test rossi prima del fix

`node --test tests/foundation/task-043-platform-admin-runtime-fixes.test.mjs`

- Esito iniziale: `FAIL_EXPECTED`
- Failure attesi:
  - `staffResult.error` incluso nel `firstError`;
  - link `Logout` mancante;
  - messaggio provisioning generico ancora presente;
  - documenti/evidence TASK-043 mancanti.

`CONFIRM_TASK043_PLATFORM_RUNTIME_TEST=yes ... npx playwright test tests/e2e/task-043-platform-admin-runtime.spec.ts --project=chromium-desktop`

- Esito iniziale: `FAIL_EXPECTED`
- Failure atteso: `Read blocked` presente nelle pagine core.
- Il test usa solo Supabase locale e credenziali temporanee generate runtime; cleanup finale rimuove user/profile/platform_admin/audit.

## Fix evidence

- `src/server/platform-admin/read-model.ts`
  - `staff_accounts_safe` esclusa dal `firstError` fatale.
  - introdotto `readIssues` per warning non fatali.
  - `staff_schema_status` diventa `BLOCKED` quando la safe staff view non e leggibile.
  - query indipendenti eseguite con `Promise.all` e limiti espliciti per ridurre la latenza del read model.
- `src/server/platform-admin/platform-section-data.ts`
  - diagnostica safe staff visibile in System/Data.
- `src/components/platform/AppShell.tsx`
  - link visibile `Logout` a `/auth/logout`.
- `src/app/platform/provisioning/page.tsx`
  - messaggio non-ready usa `readModel.reason`.
- `src/app/platform/loading.tsx`
  - feedback di loading per navigazione Platform.

## Check finali

| Comando | Esito |
| --- | --- |
| `node --test tests/foundation/task-043-platform-admin-runtime-fixes.test.mjs` | `PASS`, `tests 4`, `pass 4`, `fail 0` |
| `CONFIRM_TASK043_PLATFORM_RUNTIME_TEST=yes ... npx playwright test tests/e2e/task-043-platform-admin-runtime.spec.ts --project=chromium-desktop` | `PASS`, `1 passed`; `TASK043_NAV_LATENCY` dev sample: `867`, `839`, `835`, `841`, `834` ms; same-document marker preserved |
| `npm run security:scan` | `PASS`, `Security scan passed.` |
| `npm run test:foundation` | `PASS`, `tests 188`, `pass 188`, `fail 0` |
| `npm run typecheck` | `PASS`, route types generated and `tsc --noEmit` exit 0 |
| `npm run lint` | `PASS`, `eslint` exit 0 |
| `npm run build` | `PASS`, compiled successfully; warning noto Next su `middleware`/`proxy` |
| `npm run verify` | `PASS`, lint + typecheck + security scan + build |
| `git diff --check` | `PASS`, output vuoto |

## Riconciliazione finale 2026-06-05

- Decisione: `AUTO_RECONCILED_TASK045`.
- Task finale: `TASK-045 - Platform Master Console final automated review and DONE reconciliation`.
- Gate: `CONFIRM_TASK045_PLATFORM_FINAL_REVIEW_TEST=yes`.
- Esito TASK-045: `PASS`, `1 passed`.
- Copertura finale: route Platform Master Console, Provisioning, Admins, Operations, duplicate shop code, pending owner invite, POS manager web access, sidebar navigation, logout e cleanup operativa.
- Stato finale TASK-043: `DONE_RECONCILED`.

Note check:

- Il primo run Playwright TASK-043 era rosso perche colpiva un dev server precedente su `127.0.0.1:3000`; il run valido ha forzato `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3044` e `PLAYWRIGHT_REUSE_SERVER=0`.
- `supabase status --output env` stampa warning CLI e segnala servizi non-core stopped (`imgproxy`, `edge_runtime`, `pooler`), ma Auth/Kong/Postgres/REST locali erano disponibili per il test.
- Il click logout produce warning browser RSC fallback verso navigazione full document su `/auth/logout`; il test passa e verifica redirect `/auth/login?logged_out=1`.

## Security

- Nessun secret o credentiale salvato nei file TASK-043.
- Nessuna service role key nel client/browser.
- Test runtime usa `SUPABASE_SERVICE_ROLE_KEY` solo come environment locale process-only.
- Account e password test sono temporanei e generati runtime.
- Nessun commit, push o stage.

## Stato finale

- `TASK-043`: `DONE_RECONCILED`.
- `staff_accounts_safe`: resta follow-up tecnico separato, non blocco runtime globale.
- Win7POS live e Sales Sync live non sono parte del `DONE_RECONCILED` di TASK-043.
